import AppKit
import QuietDeskCore
import SwiftUI

/// The pages on the desk that no conversation has gathered yet.
@MainActor
struct LoosePagesSection: View {
    let pages: [DeskCapture]
    let workspace: URL
    let justCaptured: String?
    let setAside: (DeskCapture) -> Void
    let talk: () -> Void
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let palette = DeskPalette(scheme: scheme)
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .firstTextBaseline) {
                LedgerLabel("Loose pages · \(pages.count)", color: palette.ink)
                Text("yours, in your words, until you talk them through")
                    .font(.deskSerif(13))
                    .italic()
                    .foregroundStyle(palette.muted)
                Spacer()
                Button(action: talk) {
                    Label(pages.count == 1 ? "Talk it through" : "Talk these through", systemImage: "bubble.left.and.text.bubble.right")
                }
                .buttonStyle(.borderless)
                .foregroundStyle(palette.ink)
                .help("Continue in Codex with these pages on the desk")
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 18) {
                    ForEach(pages) { page in
                        LoosePageSlip(capture: page, workspace: workspace, setAside: { setAside(page) })
                            .transition(.asymmetric(
                                insertion: .modifier(active: DropIn(progress: 0), identity: DropIn(progress: 1)),
                                removal: .opacity.combined(with: .scale(scale: 0.92))
                            ))
                    }
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 16)
            }
            .scrollClipDisabled()
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Loose pages")
    }
}

/// A page landing on the desk: it falls a little, turns, and settles.
struct DropIn: ViewModifier {
    let progress: Double

    func body(content: Content) -> some View {
        content
            .offset(y: -70 * (1 - progress))
            .rotationEffect(.degrees(9 * (1 - progress)))
            .scaleEffect(1 + 0.06 * (1 - progress))
            .opacity(progress)
    }
}

@MainActor
struct LoosePageSlip: View {
    let capture: DeskCapture
    let workspace: URL
    let setAside: () -> Void
    @Environment(\.colorScheme) private var scheme
    @State private var hovering = false

    private var palette: DeskPalette { DeskPalette(scheme: scheme) }

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    if capture.kind == .note {
                        Circle().fill(palette.madder).frame(width: 5, height: 5)
                    } else {
                        Image(systemName: icon).font(.system(size: 10, weight: .medium))
                    }
                    Text(kindLabel.uppercased())
                        .font(.deskMono(9.5, weight: .medium))
                        .tracking(1.2)
                    Spacer(minLength: 4)
                    Text(capture.createdAt, format: .dateTime.hour().minute())
                        .font(.deskMono(9.5))
                        .foregroundStyle(palette.muted)
                }
                .foregroundStyle(palette.ink)

                content
            }
            .padding(14)
            .frame(width: 214, height: 158, alignment: .topLeading)
            .paper(background, radius: 3, lifted: hovering)
            .rotationEffect(.degrees(hovering ? 0 : paperTilt(capture.path)))
            .offset(y: hovering ? -4 : 0)
            .animation(.spring(response: 0.3, dampingFraction: 0.75), value: hovering)
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .contextMenu {
            Button("Open") { open() }
            Button("Reveal in Finder") { MacHelpers.reveal(path: workspace.appendingPathComponent(capture.path).path) }
            if !capture.text.isEmpty {
                Button("Copy the words") { MacHelpers.copy(capture.text) }
            }
            Divider()
            Button("Set aside") { setAside() }
        }
        .help(capture.text.isEmpty ? capture.path : capture.text)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(kindLabel): \(capture.text.isEmpty ? (capture.attachment ?? capture.path) : capture.text)")
        .accessibilityHint("Opens the page. More actions in the context menu.")
        .accessibilityIdentifier("quiet-desk.loose-page")
    }

    @ViewBuilder
    private var content: some View {
        switch capture.kind {
        case .note:
            Text(capture.text)
                .font(.deskSerif(15.5))
                .italic()
                .foregroundStyle(palette.text)
                .lineSpacing(1.5)
                .lineLimit(5)
        case .link:
            VStack(alignment: .leading, spacing: 6) {
                Text(capture.url?.host(percentEncoded: false) ?? "link")
                    .font(.deskMono(12, weight: .medium))
                    .foregroundStyle(palette.text)
                Text(capture.url?.path(percentEncoded: false) ?? capture.text)
                    .font(.deskMono(10.5))
                    .foregroundStyle(palette.muted)
                    .lineLimit(3)
            }
        case .image:
            VStack(alignment: .leading, spacing: 6) {
                if let image = attachmentImage {
                    Image(nsImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(height: capture.text.isEmpty ? 92 : 64)
                        .frame(maxWidth: .infinity)
                        .clipped()
                        .clipShape(RoundedRectangle(cornerRadius: 2))
                }
                if !capture.text.isEmpty {
                    Text(capture.text).font(.deskSerif(13)).italic().lineLimit(2).foregroundStyle(palette.text)
                }
            }
        case .file:
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "doc.text")
                    .font(.system(size: 26, weight: .light))
                    .foregroundStyle(palette.ink)
                Text(attachmentName)
                    .font(.deskMono(11))
                    .foregroundStyle(palette.text)
                    .lineLimit(2)
                if !capture.text.isEmpty {
                    Text(capture.text).font(.deskSerif(13)).italic().lineLimit(2).foregroundStyle(palette.muted)
                }
            }
        }
    }

    private var background: Color {
        switch capture.kind {
        case .note: palette.note
        case .link, .file, .image: palette.slip
        }
    }

    private var icon: String {
        switch capture.kind {
        case .note: "text.quote"
        case .link: "link"
        case .image: "photo"
        case .file: "doc"
        }
    }

    private var kindLabel: String {
        switch capture.kind {
        case .note: "Note"
        case .link: "Link"
        case .image: "Image"
        case .file: "File"
        }
    }

    private var attachmentName: String {
        guard let attachment = capture.attachment else { return "File" }
        let name = URL(fileURLWithPath: attachment).lastPathComponent
        // Copies are prefixed with the time they landed; show the original name.
        return name.replacingOccurrences(of: #"^\d{6}-(\d+-)?"#, with: "", options: .regularExpression)
    }

    private var attachmentImage: NSImage? {
        guard let attachment = capture.attachment else { return nil }
        return NSImage(contentsOf: workspace.appendingPathComponent(attachment))
    }

    private func open() {
        if capture.kind == .link, let url = capture.url {
            NSWorkspace.shared.open(url)
        } else if let attachment = capture.attachment {
            NSWorkspace.shared.open(workspace.appendingPathComponent(attachment))
        } else {
            MacHelpers.open(path: workspace.appendingPathComponent(capture.path).path)
        }
    }
}
