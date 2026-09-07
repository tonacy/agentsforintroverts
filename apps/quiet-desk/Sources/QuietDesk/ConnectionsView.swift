import QuietDeskCore
import SwiftUI

@MainActor
struct ConnectionsView: View {
    let store: QuietDeskStore
    @Bindable var providerStore: ProviderStore
    @Bindable var router: AppRouter

    var body: some View {
        Group {
            switch router.connectionKind {
            case .providers:
                ProvidersView(providerStore: providerStore, router: router)
            case .sources:
                SourcesView(store: store, router: router)
            case .agents:
                AgentsView(store: store, router: router)
            }
        }
        .navigationTitle("Agents & Sources")
        .toolbar {
            if router.connectionKind == .providers {
                ToolbarItem(placement: .automatic) {
                    Button {
                        Task { await providerStore.refreshProviders() }
                    } label: {
                        Label("Check again", systemImage: "arrow.clockwise")
                    }
                    .disabled(providerStore.isBusy)
                    .help("Detect the providers signed in on this Mac again")
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Picker("Connections", selection: $router.connectionKind) {
                        ForEach(ConnectionKind.allCases) { kind in
                            Text(kind.title).tag(kind)
                        }
                    }
                } label: {
                    Label(router.connectionKind.title, systemImage: connectionSystemImage)
                }
                .help("Choose providers, sources, or agents")
            }
        }
        .onChange(of: router.connectionKind) { _, _ in
            router.closeInspector()
        }
    }

    private var connectionSystemImage: String {
        switch router.connectionKind {
        case .providers: "terminal"
        case .sources: "externaldrive"
        case .agents: "person.2"
        }
    }
}
