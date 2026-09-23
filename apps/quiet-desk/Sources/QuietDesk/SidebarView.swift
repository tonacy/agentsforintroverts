import QuietDeskCore
import SwiftUI

@MainActor
struct SidebarView: View {
    let store: QuietDeskStore
    let providerStore: ProviderStore
    @Bindable var router: AppRouter
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        List(selection: $router.destination) {
            ForEach(QuietDeskDestination.allCases) { destination in
                Label(destination.title, systemImage: destination == .conversation ? "house" : destination.systemImage)
                    .tag(destination)
                    .contentShape(Rectangle())
                    .accessibilityLabel(destination.title)
                    .accessibilityIdentifier("quiet-desk.navigation.\(destination.rawValue)")
            }
        }
        .listStyle(.sidebar)
        .tint(DeskPalette(scheme: scheme).ink)
        .accentColor(DeskPalette(scheme: scheme).ink)
        .safeAreaInset(edge: .top) {
            HStack(spacing: 10) {
                DeskBrandMark().frame(width: 34, height: 34)
                Text("Quiet Desk").font(.headline)
                Spacer()
            }.padding(.horizontal, 14).padding(.vertical, 18)
        }
        .navigationTitle("Quiet Desk")
        .safeAreaInset(edge: .bottom) {
            VStack(alignment: .leading, spacing: 5) {
                Label(
                    providerStore.workspaceName.map { "Workspace: \($0)" } ?? "Sample data",
                    systemImage: providerStore.hasWorkspace ? "folder" : "testtube.2"
                )
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
