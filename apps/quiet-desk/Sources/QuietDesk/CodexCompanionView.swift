import QuietDeskCore
import SwiftUI

@MainActor
struct CodexCompanionView: View {
    @Bindable var providerStore: ProviderStore
    @Bindable var router: AppRouter
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var scheme
    @Environment(\.openWindow) private var openWindow
    @Environment(DeskStore.self) private var desk
    @State private var openingError: String?
    @State private var selectedItem: CompanionWorkItem?
    @State private var shelfWidth: CGFloat = 760
    private var columns: [GridItem] {
        let count = min(max(items.count, 1), 3, max(1, Int((shelfWidth + 22) / 282)))
        return Array(repeating: GridItem(.flexible(), spacing: 22, alignment: .top), count: count)
    }
    private var items: [CompanionWorkItem] { providerStore.companion?.workItems ?? [] }
    private var palette: DeskPalette { DeskPalette(scheme: scheme) }

    /// Paths the work already points at: those pages have been gathered.
    private var references: Set<String> {
        Set(items.flatMap { $0.sources.compactMap(\.path) })
    }
    private var loose: [DeskCapture] { desk.loose(referencedBy: references) }

    var body: some View {
        VStack(alignment: .leading, spacing: 34) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .bottom, spacing: 24) { heading; Spacer(minLength: 20); continueButton }
                VStack(alignment: .leading, spacing: 20) { heading; continueButton }
            }
            if let error = openingError ?? providerStore.lastError ?? providerStore.companion?.syncError {
                Label(error, systemImage: "exclamationmark.circle")
                    .font(.callout).foregroundStyle(.orange).textSelection(.enabled)
                    .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                    .background(palette.paper, in: RoundedRectangle(cornerRadius: 8))
            }
            CaptureWell(desk: desk, focusRequest: $router.captureFocus)
            if let workspace = desk.workspaceURL {
                if !loose.isEmpty {
                    LoosePagesSection(pages: loose, workspace: workspace, justCaptured: desk.justCaptured, setAside: { page in
                        withAnimation(.easeOut(duration: 0.25)) { desk.setAside(page) }
                    }, talk: openCodex)
                }
                if !desk.pieces.isEmpty {
                    PiecesSection(pieces: desk.pieces, workspace: workspace) { piece in
                        openWindow(id: "piece", value: piece.folder)
                    }
                }
            }
            if items.isEmpty {
                if desk.pieces.isEmpty && loose.isEmpty { emptyShelf }
            } else {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(alignment: .firstTextBaseline) {
                        LedgerLabel("In progress · \(items.count)", color: palette.ink)
                        Text("Codex’s reading of the work, from your conversations")
                            .font(.deskSerif(13)).italic().foregroundStyle(palette.muted)
                    }
                    LazyVGrid(columns: columns, alignment: .leading, spacing: 24) {
                        ForEach(items) { item in
                            DeskWorkCard(item: item, workspace: providerStore.workspacePath ?? "", openPiece: pieceOpener(for: item)) { selectedItem = item }
                        }
                    }
                }
            }
            if let decision = providerStore.companion?.latestDecision,
               let item = items.first(where: { $0.id == decision.workItemId }) {
                Button { selectedItem = item } label: {
                    HStack(alignment: .center, spacing: 20) {
                        Image(systemName: "doc.text").font(.title)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Latest decision").font(.caption).foregroundStyle(.secondary)
                            Text(decision.text).font(.body).multilineTextAlignment(.leading)
                        }
                        Spacer(minLength: 12)
                        Image(systemName: "arrow.right").foregroundStyle(palette.ink)
                    }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
                        .background(palette.paper, in: RoundedRectangle(cornerRadius: 12))
                }.buttonStyle(.plain).accessibilityIdentifier("quiet-desk.latest-decision")
            }
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Codex understanding · private to your Desk").font(.caption)
                    if let updated = providerStore.companion?.updatedAt {
                        Text("Saved \(updated.formatted(date: .abbreviated, time: .shortened))").font(.caption2)
                    }
                }.foregroundStyle(.secondary)
                Spacer()
                if providerStore.isBusy { ProgressView().controlSize(.small).accessibilityLabel("Refreshing your Desk") }
                Button("Refresh", systemImage: "arrow.clockwise") { Task { await providerStore.refreshCompanion() } }
                    .disabled(providerStore.isBusy).accessibilityIdentifier("quiet-desk.companion.refresh")
            }
            Divider()
            notes
            DisclosureGroup("Advanced: manual check-in and publishing") {
                CodexCheckInView(providerStore: providerStore, router: router).padding(.top, 16)
            }.font(.callout).foregroundStyle(.secondary)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { shelfWidth = $0 }
        .tint(palette.ink)
        .sheet(item: $selectedItem) { item in
            DeskWorkDetail(item: item, workspace: providerStore.workspacePath ?? "", openPiece: pieceOpener(for: item))
        }
        .task(id: providerStore.workspacePath) {
            desk.open(workspace: providerStore.workspacePath)
            await providerStore.refreshCompanion()
        }
        .onChange(of: providerStore.workspacePath) { _, _ in selectedItem = nil }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                desk.refresh()
                Task { await providerStore.refreshCompanion() }
            }
        }
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day()).uppercased())
                .font(.deskMono(11, weight: .medium)).tracking(1.4).foregroundStyle(palette.muted)
            Text("On the desk").font(.deskSerif(44)).foregroundStyle(palette.text).fixedSize()
            Text(summary)
                .font(.deskSerif(17)).italic().foregroundStyle(palette.muted)
        }
    }

    /// One sentence for where the loop stands, from the files themselves.
    private var summary: String {
        var parts: [String] = []
        if !loose.isEmpty { parts.append("\(loose.count) loose \(loose.count == 1 ? "page" : "pages")") }
        if !items.isEmpty { parts.append("\(items.count) \(items.count == 1 ? "piece" : "pieces") of work taking shape") }
        let waiting = desk.pieces.filter { $0.forms.contains { $0.state == .draft || $0.state == .changedSinceSigned } }.count
        if waiting > 0 { parts.append("\(waiting) \(waiting == 1 ? "piece" : "pieces") waiting for your mark") }
        guard !parts.isEmpty else { return "A clear desk. Put something on it when it happens." }
        return parts.joined(separator: ", ").prefix(1).uppercased() + parts.joined(separator: ", ").dropFirst() + "."
    }

    /// Work that grew into a piece leads straight to its studio.
    private func pieceOpener(for item: CompanionWorkItem) -> (() -> Void)? {
        guard let piece = desk.piece(referencedBy: item.sources.compactMap(\.path)) else { return nil }
        return { openWindow(id: "piece", value: piece.folder) }
    }

    private func openCodex() {
        Task {
            openingError = nil
            if let url = await providerStore.prepareCodexConversation(), !NSWorkspace.shared.open(url) {
                openingError = "Codex could not be opened. Open the Codex desktop app and try again."
            }
        }
    }

    private var continueButton: some View {
        Button(action: openCodex) {
            Label(providerStore.companion?.threadId == nil ? "Talk with Codex" : "Continue in Codex", systemImage: "terminal")
                .font(.body.weight(.medium)).padding(.horizontal, 10).padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent).tint(Color(red: 0.06, green: 0.29, blue: 0.22))
        .controlSize(.large).disabled(providerStore.isBusy)
        .overlay(alignment: .bottom) {
            if !loose.isEmpty {
                Text("\(loose.count) loose \(loose.count == 1 ? "page" : "pages") to talk through")
                    .font(.deskMono(10))
                    .foregroundStyle(palette.muted)
                    .fixedSize()
                    .offset(y: 24)
            }
        }
        .accessibilityIdentifier("quiet-desk.companion.open")
        .help(providerStore.companion?.threadId == nil ? "Opens a prepared conversation in Codex; press Send to begin." : "Return to your existing Codex conversation.")
    }

    private var emptyShelf: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(providerStore.isBusy && providerStore.companion == nil ? "Opening your Desk…" : providerStore.companion?.summary == nil ? "Room for your work." : "Your conversation notes are here.")
                .font(.deskSerif(26))
                .foregroundStyle(palette.text)
            Text(providerStore.companion?.summary == nil
                 ? "Put what you are making on the desk as it happens, then talk it through. Codex can draw on your context and suggest a few concrete things to explore."
                 : "Your saved notes are below. As Codex saves individual pieces of work, their previews will appear here.")
                .font(.deskSerif(15)).foregroundStyle(palette.muted).frame(maxWidth: 560, alignment: .leading)
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var notes: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let summary = providerStore.companion?.summary {
                DisclosureGroup("Conversation notes") {
                    Text(summary).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 12)
                }
            }
            if let questions = providerStore.companion?.openQuestions, !questions.isEmpty {
                DisclosureGroup("Still open · \(questions.count)") {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(Array(questions.enumerated()), id: \.offset) { _, question in Text(question).textSelection(.enabled) }
                    }.padding(.top, 10)
                }
            }
            if let updates = providerStore.companion?.updates, !updates.isEmpty {
                DisclosureGroup("Recent context updates") {
                    VStack(alignment: .leading, spacing: 16) {
                        ForEach(updates) { update in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(update.reason).textSelection(.enabled)
                                Text(update.createdAt.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }.padding(.top, 12)
                }
            }
        }.font(.callout)
    }
}
