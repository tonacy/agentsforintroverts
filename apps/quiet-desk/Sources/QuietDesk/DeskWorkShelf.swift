import AppKit
import QuietDeskCore
import SwiftUI

struct DeskPalette {
    let scheme: ColorScheme
    var canvas: Color { scheme == .dark ? Color(red: 0.10, green: 0.14, blue: 0.13) : Color(red: 0.92, green: 0.94, blue: 0.91) }
    var paper: Color { scheme == .dark ? Color(red: 0.16, green: 0.20, blue: 0.18) : Color(red: 0.99, green: 0.98, blue: 0.96) }
    var ink: Color { scheme == .dark ? Color(red: 0.67, green: 0.85, blue: 0.74) : Color(red: 0.06, green: 0.29, blue: 0.22) }
}

struct DeskBrandMark: View {
    /// The packaged app carries the mark; a build run from source finds it in the repository.
    private static let image: NSImage? = {
        if let url = Bundle.main.url(forResource: "DriftingPage", withExtension: "png") { return NSImage(contentsOf: url) }
        guard let repo = RunnerLocator.findRepoRoot(overridePath: nil) else { return nil }
        return NSImage(contentsOf: repo.appendingPathComponent("public/brand/drifting-page-mark.png"))
    }()

    var body: some View {
        if let image = Self.image {
            Image(nsImage: image).resizable().scaledToFit().accessibilityHidden(true)
        }
    }
}

private struct FoldShape: Shape {
    func path(in rect: CGRect) -> Path {
        Path { path in
            path.move(to: .zero)
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.addLine(to: CGPoint(x: 0, y: rect.maxY))
            path.closeSubpath()
        }
    }
}

struct DeskWorkCard: View {
    let item: CompanionWorkItem
    let workspace: String
    var openPiece: (() -> Void)?
    let open: () -> Void
    @Environment(\.colorScheme) private var scheme
    @State private var hovering = false
    private var palette: DeskPalette { DeskPalette(scheme: scheme) }

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 18) {
                Text(item.project.uppercased()).font(.system(size: 10, weight: .medium, design: .monospaced)).tracking(1.4).foregroundStyle(.secondary)
                Text(item.title)
                    .font(.system(size: 27, weight: .regular, design: .serif))
                    .lineLimit(4).fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Label(item.state, systemImage: "circle.fill")
                    .font(.callout).foregroundStyle(palette.ink)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(palette.ink.opacity(0.08), in: Capsule())
                if let image = previewImage {
                    Image(nsImage: image).resizable().scaledToFit()
                        .frame(maxHeight: 150).clipShape(RoundedRectangle(cornerRadius: 6))
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 13) {
                    ForEach(Array(item.preview.prefix(2).enumerated()), id: \.offset) { _, block in
                        Divider()
                        VStack(alignment: .leading, spacing: 5) {
                            Text(block.heading).font(.body.weight(.medium)).lineLimit(2)
                            Text(block.text).font(.callout).foregroundStyle(.secondary).lineLimit(3)
                        }
                    }
                }
                Spacer(minLength: 8)
                HStack {
                    Text("Codex’s reading").font(.system(size: 10, design: .monospaced)).foregroundStyle(.secondary)
                    if openPiece != nil {
                        Text("· has a piece").font(.system(size: 10, design: .monospaced)).foregroundStyle(palette.ink)
                    }
                    Spacer()
                    Image(systemName: "arrow.up.right").foregroundStyle(palette.ink)
                }
            }
            .padding(24).padding(.top, 12)
            .frame(maxWidth: .infinity, minHeight: 360, alignment: .topLeading)
            .background(palette.paper, in: RoundedRectangle(cornerRadius: 9))
            .overlay(alignment: .topTrailing) {
                FoldShape().fill(palette.canvas).frame(width: 32, height: 32)
                    .overlay(alignment: .bottom) { Rectangle().fill(palette.ink.opacity(0.12)).frame(height: 1) }
                    .accessibilityHidden(true)
            }
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(palette.ink.opacity(hovering ? 0.7 : 0.12), lineWidth: hovering ? 1.5 : 0.5))
            .shadow(color: .black.opacity(scheme == .dark ? 0.13 : 0.05), radius: 12, y: 5)
            .contentShape(RoundedRectangle(cornerRadius: 9))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .contextMenu {
            Button("Open details", action: open)
            if let openPiece {
                Button("Open the piece in the studio", action: openPiece)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("\(item.project): \(item.title). \(item.state). Open details.")
        .accessibilityIdentifier("quiet-desk.work-item.\(item.id)")
        .help("Open \(item.title)")
    }

    private var previewImage: NSImage? {
        guard let path = item.imagePath,
              let url = CompanionWorkSource(label: "Preview", path: path, url: nil).destination(workspace: workspace),
              ["png", "jpg", "jpeg", "webp"].contains(url.pathExtension.lowercased()) else { return nil }
        return NSImage(contentsOf: url)
    }
}

struct DeskWorkDetail: View {
    let item: CompanionWorkItem
    let workspace: String
    var openPiece: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var sourceError: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(item.project).font(.headline).foregroundStyle(.secondary)
                Spacer()
                if let openPiece {
                    Button {
                        dismiss()
                        openPiece()
                    } label: {
                        Label("Open the piece", systemImage: "doc.richtext")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(DeskPalette(scheme: scheme).ink)
                }
                Button("Done") { dismiss() }.keyboardShortcut(.cancelAction)
            }.padding(24)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text(item.title).font(.system(size: 34, weight: .medium, design: .serif)).fixedSize(horizontal: false, vertical: true)
                    Text(item.state).font(.headline).foregroundStyle(DeskPalette(scheme: scheme).ink)
                    ForEach(Array(item.preview.enumerated()), id: \.offset) { _, block in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(block.heading).font(.title3.weight(.medium))
                            Text(block.text).foregroundStyle(.secondary)
                        }
                    }
                    if !item.notes.isEmpty {
                        Divider()
                        Text("Notes").font(.headline)
                        Text(item.notes)
                    }
                    Divider()
                    Text("Basis for this view").font(.headline)
                    Text(item.evidence).foregroundStyle(.secondary)
                    Text("This preview and its current state are Codex interpretations. They are not a human quote, approval, or proof of delivery.")
                        .font(.caption).foregroundStyle(.secondary)
                    ForEach(Array(item.sources.enumerated()), id: \.offset) { _, source in
                        Button {
                            guard let url = source.destination(workspace: workspace) else { sourceError = "This source is no longer available."; return }
                            if url.isFileURL { NSWorkspace.shared.activateFileViewerSelecting([url]) }
                            else if !NSWorkspace.shared.open(url) { sourceError = "The source could not be opened." }
                        } label: {
                            Label(source.label, systemImage: source.path == nil ? "arrow.up.right" : "doc.text.magnifyingglass")
                        }
                        .help(source.path == nil ? "Open source in your browser" : "Reveal source in Finder")
                    }
                    if !item.messageIds.isEmpty {
                        DisclosureGroup("Conversation references (\(item.messageIds.count))") {
                            ForEach(item.messageIds, id: \.self) { Text($0).font(.caption).textSelection(.enabled) }
                        }
                    }
                    if let sourceError { Label(sourceError, systemImage: "exclamationmark.circle").foregroundStyle(.orange) }
                }
                .textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading).padding(28)
            }
        }
        .frame(minWidth: 440, idealWidth: 620, maxWidth: 720, minHeight: 400, idealHeight: 620, maxHeight: 760)
        .background(DeskPalette(scheme: scheme).paper)
        .accessibilityIdentifier("quiet-desk.work-item.details")
    }
}
