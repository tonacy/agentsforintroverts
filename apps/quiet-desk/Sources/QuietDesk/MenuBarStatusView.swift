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
                Text("Sample data · \(store.readOnlyMode ? "Read-only" : "Local approvals on")")
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
        switch store.pendingApprovalCount {
        case 0: "Your desk is quiet."
        case 1: "One thing is ready when you are."
        default: "\(store.pendingApprovalCount) things are ready when you are."
        }
    }
}
