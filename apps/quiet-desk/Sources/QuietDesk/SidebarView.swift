import QuietDeskCore
import SwiftUI

@MainActor
struct SidebarView: View {
    let store: QuietDeskStore
    @Bindable var router: AppRouter

    var body: some View {
        List(selection: $router.destination) {
            ForEach(QuietDeskDestination.allCases) { destination in
                Label(destination.title, systemImage: destination.systemImage)
                    .tag(destination)
                    .contentShape(Rectangle())
                    .accessibilityLabel(destination.title)
                    .accessibilityIdentifier("quiet-desk.navigation.\(destination.rawValue)")
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("Quiet Desk")
        .safeAreaInset(edge: .bottom) {
            VStack(alignment: .leading, spacing: 5) {
                Label("Sample data", systemImage: "testtube.2")
                Label(
                    store.readOnlyMode ? "Read-only" : "Local approvals on",
                    systemImage: store.readOnlyMode ? "lock" : "checkmark.shield"
                )
                .foregroundStyle(store.readOnlyMode ? Color.secondary : Color.orange)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.bar)
        }
        .accessibilityLabel("Quiet Desk navigation")
    }
}
