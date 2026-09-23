import AppKit
import QuietDeskCore
import SwiftUI

@main
@MainActor
struct QuietDeskApp: App {
    @State private var store: QuietDeskStore
    @State private var providerStore: ProviderStore
    @State private var router: AppRouter
    @State private var desk = DeskStore()

    init() {
        // A snapshot run keeps its settings apart from the person's own.
        let defaults = SnapshotHarness.defaults ?? .standard
        _store = State(initialValue: QuietDeskStore(
            client: .bundledSyntheticFixtures,
            defaults: defaults,
            feedStateRepository: .applicationSupport
        ))
        let providers = ProviderStore(bridge: ProcessRunnerBridge(), defaults: defaults)
        if let workspace = SnapshotHarness.workspace { providers.workspacePath = workspace }
        if !providers.hasWorkspace {
            let defaultWorkspace = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Quiet Desk")
            let existing = providers.workspacePath
            providers.workspacePath = defaultWorkspace.path
            if !providers.hasWorkspace { providers.workspacePath = existing }
        }
        _providerStore = State(initialValue: providers)
        _router = State(initialValue: AppRouter())
    }

    var body: some Scene {
        WindowGroup("Quiet Desk", id: "main") {
            AppShellView(store: store, providerStore: providerStore, router: router)
                .environment(desk)
                .snapshotActiveAppearance()
                .frame(minWidth: 880, minHeight: 600)
        }
        .defaultSize(width: 1_120, height: 760)
        .commands {
            SidebarCommands()
            CommandGroup(replacing: .newItem) {
                Button("New Loose Page") {
                    router.destination = .conversation
                    router.captureFocus = true
                }
                .keyboardShortcut("n", modifiers: .command)
            }
            QuietDeskCommands(store: store, providerStore: providerStore, router: router)
        }

        WindowGroup("Piece", id: "piece", for: String.self) { $folder in
            if let folder {
                PieceStudioView(desk: desk, providerStore: providerStore, folder: folder)
                    .environment(desk)
                    .snapshotActiveAppearance()
            }
        }
        .defaultSize(width: 1_320, height: 860)

        Settings {
            QuietDeskSettingsView(store: store, providerStore: providerStore)
        }

        MenuBarExtra(
            "Quiet Desk",
            systemImage: "square.and.pencil",
            isInserted: Binding(
                get: { store.menuBarEnabled },
                set: { store.menuBarEnabled = $0 }
            )
        ) {
            MenuBarStatusView(store: store, providerStore: providerStore)
                .environment(desk)
        }
        .menuBarExtraStyle(.window)
    }
}

@MainActor
private struct QuietDeskCommands: Commands {
    let store: QuietDeskStore
    let providerStore: ProviderStore
    let router: AppRouter

    var body: some Commands {
        CommandMenu("Quiet Desk") {
            Button("Today") { router.destination = .conversation }
                .keyboardShortcut("1", modifiers: .command)
            Button("Activity") { router.destination = .activity }
                .keyboardShortcut("2", modifiers: .command)
            Button("Agents & Sources") { router.destination = .connections }
                .keyboardShortcut("3", modifiers: .command)

            Divider()

            Button("Run Today's Conversation") {
                router.destination = .conversation
                Task { await providerStore.runToday(mode: .short) }
            }
            .keyboardShortcut("r", modifiers: [.command, .shift])
            .disabled(!providerStore.hasWorkspace || providerStore.preferredProvider == nil || providerStore.isBusy)

            Button("Check Providers") {
                router.connectionKind = .providers
                router.destination = .connections
                Task { await providerStore.refreshProviders() }
            }

            Divider()

            Button("Refresh Synthetic Fixtures") {
                Task { await store.reload() }
            }
            .keyboardShortcut("r", modifiers: .command)

            Button("Approve Selected Exact Payload") {
                guard let itemID = selectedApprovalItemID else { return }
                _ = try? store.approveAction(for: itemID)
            }
            .keyboardShortcut(.return, modifiers: .command)
            .disabled(!store.canApprove(itemID: selectedApprovalItemID))
        }
    }

    private var selectedApprovalItemID: UUID? {
        router.selectedFeedID ?? store.handoffItem(for: router.selectedThreadID)?.id
    }
}
