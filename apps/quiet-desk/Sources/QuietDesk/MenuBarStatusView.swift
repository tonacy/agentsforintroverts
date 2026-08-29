import AppKit
import QuietDeskCore
import SwiftUI

@MainActor
struct MenuBarStatusView: View {
    let store: QuietDeskStore
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(statusTitle)
                    .font(.headline)
                Text("Sample data · \(store.pendingApprovalCount) exact proposals · \(store.readOnlyMode ? "Read-only" : "Local approvals on")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Button("Open Quiet Desk") {
                openWindow(id: "main")
                NSApp.activate(ignoringOtherApps: true)
            }
        }
        .padding(14)
        .frame(width: 270)
        .accessibilityElement(children: .contain)
    }

    private var statusTitle: String {
        switch store.pendingHandoffCount {
        case 0: "No human handoff needs you."
        case 1: "One human thread is ready."
        default: "\(store.pendingHandoffCount) human threads are ready."
        }
    }
}
