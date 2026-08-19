import AppKit
import QuietDeskCore
import SwiftUI

@main
@MainActor
struct QuietDeskApp: App {
    @State private var store: QuietDeskStore
    @State private var router: AppRouter

    init() {
        _store = State(initialValue: QuietDeskStore(
            client: .bundledSyntheticFixtures,
            defaults: .standard
        ))
        _router = State(initialValue: AppRouter())
    }

    var body: some Scene {
        WindowGroup("Quiet Desk", id: "main") {
            AppShellView(store: store, router: router)
                .frame(minWidth: 880, minHeight: 600)
        }
        .defaultSize(width: 1_120, height: 760)
        .commands {
            SidebarCommands()
            QuietDeskCommands(store: store, router: router)
        }

        Settings {
            QuietDeskSettingsView(store: store)
        }

        MenuBarExtra(
            "Quiet Desk",
            systemImage: "circle.grid.cross",
            isInserted: Binding(
                get: { store.menuBarEnabled },
                set: { store.menuBarEnabled = $0 }
            )
        ) {
            MenuBarStatusView(store: store)
        }
        .menuBarExtraStyle(.window)
    }
}

@MainActor
private struct QuietDeskCommands: Commands {
    let store: QuietDeskStore
    let router: AppRouter

    var body: some Commands {
        CommandMenu("Quiet Desk") {
            Button("Now") { router.destination = .now }
                .keyboardShortcut("1", modifiers: .command)
            Button("Activity") { router.destination = .activity }
                .keyboardShortcut("2", modifiers: .command)
            Button("Agents & Sources") { router.destination = .connections }
                .keyboardShortcut("3", modifiers: .command)

            Divider()

            Button("Refresh Synthetic Fixtures") {
                Task { await store.reload() }
            }
            .keyboardShortcut("r", modifiers: .command)

            Button("Approve Selected Exact Payload") {
                guard let itemID = router.selectedFeedID else { return }
                _ = try? store.approveAction(for: itemID)
            }
            .keyboardShortcut(.return, modifiers: .command)
            .disabled(!store.canApprove(itemID: router.selectedFeedID))
        }
    }
}
