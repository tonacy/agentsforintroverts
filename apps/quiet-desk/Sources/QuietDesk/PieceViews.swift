import AppKit
import QuietDeskCore
import SwiftUI
import WebKit

// MARK: Rendering pages

/// Renders a local page offscreen and keeps a picture of it, so the Desk can
/// show a piece as it will actually read. Pictures are keyed by the file's
/// modification date, so a re-rendered piece gets a fresh one.
@MainActor
final class PageSnapshotter: NSObject, WKNavigationDelegate {
    static let shared = PageSnapshotter()

    private var cache: [String: NSImage] = [:]
    private var waiting: [ObjectIdentifier: CheckedContinuation<Void, Never>] = [:]

    func image(of page: URL, readAccess: URL, size: CGSize, snapshotWidth: CGFloat) async -> NSImage? {
        let modified = (try? page.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
        let key = "\(page.path)|\(modified.timeIntervalSince1970)|\(Int(size.width))x\(Int(size.height))|\(Int(snapshotWidth))"
        if let cached = cache[key] { return cached }

        let window = NSWindow(contentRect: NSRect(origin: CGPoint(x: -30_000, y: -30_000), size: size), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        // An offscreen page never plays its arrival; picture it at rest.
        let configuration = WKWebViewConfiguration()
        let still = "document.documentElement.appendChild(Object.assign(document.createElement('style'), { textContent: '*, *::before, *::after { animation: none !important; transition: none !important; }' }));"
        configuration.userContentController.addUserScript(WKUserScript(source: still, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        let web = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: configuration)
        web.navigationDelegate = self
        window.contentView = web
        window.orderFrontRegardless()
        defer { window.orderOut(nil) }

        await withCheckedContinuation { continuation in
            waiting[ObjectIdentifier(web)] = continuation
            web.loadFileURL(page, allowingReadAccessTo: readAccess)
        }
        // Let the house fonts settle before taking the picture.
        try? await Task.sleep(for: .milliseconds(350))
        let snapshot = WKSnapshotConfiguration()
        snapshot.rect = CGRect(origin: .zero, size: size)
        snapshot.snapshotWidth = NSNumber(value: Double(snapshotWidth))
        let image = try? await web.takeSnapshot(configuration: snapshot)
        if let image { cache[key] = image }
        return image
    }

    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        MainActor.assumeIsolated { resume(webView) }
    }

    nonisolated func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        MainActor.assumeIsolated { resume(webView) }
    }

    nonisolated func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        MainActor.assumeIsolated { resume(webView) }
    }

    private func resume(_ webView: WKWebView) {
        waiting.removeValue(forKey: ObjectIdentifier(webView))?.resume()
    }
}

/// A still picture of a local page, for when a live one cannot be shown.
struct PagePicture: View {
    let page: URL
    let directory: URL
    let size: CGSize
    @State private var image: NSImage?

    var body: some View {
        ScrollView {
            if let image {
                Image(nsImage: image).resizable().scaledToFit()
            }
        }
        .task(id: page) {
            image = await PageSnapshotter.shared.image(of: page, readAccess: directory, size: size, snapshotWidth: size.width)
        }
    }
}

/// A local page, live. Links to the web open in the browser, never here.
struct LocalPage: NSViewRepresentable {
    let url: URL
    let readAccess: URL
    var zoom: CGFloat = 1

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let web = WKWebView()
        web.navigationDelegate = context.coordinator
        web.setValue(false, forKey: "drawsBackground")
        web.pageZoom = zoom
        web.loadFileURL(url, allowingReadAccessTo: readAccess)
        context.coordinator.loaded = url
        return web
    }

    func updateNSView(_ web: WKWebView, context: Context) {
        if web.pageZoom != zoom { web.pageZoom = zoom }
        if context.coordinator.loaded != url {
            context.coordinator.loaded = url
            web.loadFileURL(url, allowingReadAccessTo: readAccess)
        }
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        var loaded: URL?

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let target = action.request.url else { return .cancel }
            if target.isFileURL { return .allow }
            if action.navigationType == .linkActivated, target.scheme == "https" {
                NSWorkspace.shared.open(target)
            }
            return .cancel
        }
    }
}

// MARK: Pieces on the desk

@MainActor
struct PiecesSection: View {
    let pieces: [Piece]
    let workspace: URL
    let open: (Piece) -> Void
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = DeskPalette(scheme: scheme)
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .firstTextBaseline) {
                LedgerLabel("Pieces · \(pieces.count)", color: palette.ink)
                Text(summary)
                    .font(.deskSerif(13))
                    .italic()
                    .foregroundStyle(palette.muted)
                Spacer()
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 26) {
                    ForEach(pieces) { piece in
                        PiecePrint(piece: piece, workspace: workspace) { open(piece) }
                    }
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 14)
            }
            .scrollClipDisabled()
        }
    }

    private var summary: String {
        let waiting = pieces.filter { $0.forms.contains { $0.state == .draft || $0.state == .changedSinceSigned } }.count
        let out = pieces.filter { $0.stage == .outInTheWorld }.count
        var parts: [String] = []
        if waiting > 0 { parts.append("\(waiting) waiting for your mark") }
        if out > 0 { parts.append("\(out) out in the world") }
        return parts.isEmpty ? "held on the desk until you sign them" : parts.joined(separator: " · ")
    }
}

@MainActor
struct PiecePrint: View {
    let piece: Piece
    let workspace: URL
    let open: () -> Void
    @Environment(\.colorScheme) private var scheme
    @State private var picture: NSImage?
    @State private var hovering = false

    private var palette: DeskPalette { DeskPalette(scheme: scheme) }
    private var folder: URL { workspace.appendingPathComponent(piece.folder, isDirectory: true) }

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 0) {
                ZStack(alignment: .top) {
                    palette.sheet
                    if let picture {
                        Image(nsImage: picture)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 236, height: 300, alignment: .top)
                            .clipped()
                            .transition(.opacity)
                    } else {
                        cover
                    }
                }
                .frame(width: 236, height: 300)
                .clipped()
                .overlay(alignment: .bottomTrailing) {
                    if piece.stage >= .signed {
                        Chop(size: 34).padding(12)
                    }
                }

                footer
            }
            .padding(9)
            .paper(palette.sheet, radius: 3, lifted: hovering)
            .rotationEffect(.degrees(hovering ? 0 : paperTilt(piece.id, range: 1.2)))
            .offset(y: hovering ? -5 : 0)
            .animation(.spring(response: 0.32, dampingFraction: 0.78), value: hovering)
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .task(id: piece.experience) { await loadPicture() }
        .help("Open \(piece.title) in the studio")
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("\(piece.title). \(stageLabel). \(formSummary)")
        .accessibilityIdentifier("quiet-desk.piece.\(piece.id)")
    }

    /// Until the page has been pictured, set a cover in the house style.
    private var cover: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text((piece.kicker ?? piece.project ?? "From the desk").uppercased())
                .font(.deskMono(8.5, weight: .medium))
                .tracking(1.3)
                .foregroundStyle(palette.ink)
            emphasizedTitle(piece.rawTitle, accent: Color(red: 0.06, green: 0.29, blue: 0.22))
                .font(.deskSerif(30))
                .foregroundStyle(palette.sheetInk)
                .lineSpacing(-4)
            if let deck = piece.deck {
                Text(deck)
                    .font(.deskSerif(12.5))
                    .italic()
                    .foregroundStyle(palette.sheetInk.opacity(0.7))
            }
            Spacer()
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(piece.title)
                .font(.deskSerif(15, weight: .medium))
                .foregroundStyle(palette.sheetInk)
                .lineLimit(1)
            HStack(spacing: 10) {
                Text(stageLabel.uppercased())
                    .font(.deskMono(9, weight: .medium))
                    .tracking(1.1)
                    .foregroundStyle(piece.stage == .draft ? Color(red: 0.42, green: 0.47, blue: 0.43) : Color(red: 0.65, green: 0.25, blue: 0.18))
                Spacer()
                HStack(spacing: 5) {
                    ForEach(piece.forms) { form in
                        FormDot(state: form.state)
                            .help("\(form.channel): \(form.state.label)")
                    }
                }
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 12)
        .padding(.bottom, 3)
        .frame(width: 236, alignment: .leading)
    }

    private var stageLabel: String {
        switch piece.stage {
        case .draft: "Draft · r\(piece.revision)"
        case .signed: "Signed · r\(piece.revision)"
        case .outInTheWorld: "Out in the world"
        }
    }

    private var formSummary: String {
        piece.forms.map { "\($0.channel) \($0.state.label.lowercased())" }.joined(separator: ", ")
    }

    private func loadPicture() async {
        guard let experience = piece.experience else { return }
        let image = await PageSnapshotter.shared.image(
            of: folder.appendingPathComponent(experience),
            readAccess: folder,
            size: CGSize(width: 1180, height: 1500),
            snapshotWidth: 472
        )
        withAnimation(.easeOut(duration: 0.25)) { picture = image }
    }
}

/// One form's state at a glance: hollow for a draft, madder for signed,
/// filled ink once it is out in the world.
struct FormDot: View {
    let state: FormState

    var body: some View {
        let madder = Color(red: 0.65, green: 0.25, blue: 0.18)
        let ink = Color(red: 0.06, green: 0.29, blue: 0.22)
        ZStack {
            switch state {
            case .draft:
                Circle().strokeBorder(ink.opacity(0.45), lineWidth: 1.2)
            case .changedSinceSigned:
                Circle().strokeBorder(madder, style: StrokeStyle(lineWidth: 1.2, dash: [2, 1.6]))
            case .signed:
                Circle().fill(madder)
            case .published:
                Circle().fill(ink)
            }
        }
        .frame(width: 9, height: 9)
    }
}

extension FormState {
    var label: String {
        switch self {
        case .draft: "Awaiting your mark"
        case .changedSinceSigned: "Changed since you signed"
        case .signed: "Signed"
        case .published: "Out in the world"
        }
    }
}
