import QuietDeskCore
import SwiftUI

@MainActor
struct ConnectionsView: View {
    let store: QuietDeskStore
    @Bindable var router: AppRouter

    var body: some View {
        Group {
            switch router.connectionKind {
            case .sources:
                SourcesView(store: store, router: router)
            case .agents:
                AgentsView(store: store, router: router)
            }
        }
        .navigationTitle("Agents & Sources")
        .toolbar {
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
                .help("Choose sources or agents")
            }
        }
        .onChange(of: router.connectionKind) { _, _ in
            router.closeInspector()
        }
    }

    private var connectionSystemImage: String {
        switch router.connectionKind {
        case .sources: "externaldrive"
        case .agents: "person.2"
        }
    }
}
