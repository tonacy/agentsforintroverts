import QuietDeskCore
import SwiftUI

@MainActor
struct AppShellView: View {
    @Bindable var store: QuietDeskStore
    @Bindable var router: AppRouter

    var body: some View {
        NavigationSplitView(columnVisibility: $router.columnVisibility) {
            SidebarView(store: store, router: router)
                .navigationSplitViewColumnWidth(min: 180, ideal: 210, max: 250)
        } detail: {
            contentColumn
        }
        .navigationSplitViewStyle(.balanced)
        .inspector(isPresented: inspectorPresented) {
            VStack(spacing: 0) {
                HStack {
                    Text("Details")
                        .font(.headline)
                    Spacer()
                    Button {
                        router.closeInspector()
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Close details")
                    .accessibilityIdentifier("quiet-desk.details.close")
                    .help("Close details")
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)

                Divider()

                detailColumn
            }
            .inspectorColumnWidth(min: 340, ideal: 420, max: 520)
        }
        .task {
            await store.loadIfNeeded()
            router.ensureSelection(in: store.snapshot)
        }
        .onChange(of: store.loadState) { _, _ in
            router.ensureSelection(in: store.snapshot)
        }
        .onChange(of: router.destination) { _, _ in
            router.closeInspector()
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Section {
                        Label("Sample data", systemImage: "testtube.2")
                        Label(
                            store.readOnlyMode ? "Read-only" : "Local approvals on",
                            systemImage: store.readOnlyMode ? "lock" : "checkmark.shield"
                        )
                    }

                    Divider()

                    Button {
                        Task { await store.reload() }
                    } label: {
                        Label("Reload sample data", systemImage: "arrow.clockwise")
                    }

                    SettingsLink {
                        Label("Settings", systemImage: "gearshape")
                    }
                } label: {
                    Label("More", systemImage: "ellipsis.circle")
                }
                .help("Sample mode, refresh, and settings")
            }
        }
    }

    @ViewBuilder
    private var contentColumn: some View {
        switch router.destination {
        case .conversation:
            DailyConversationView(store: store, router: router)
        case .activity:
            ActivityView(store: store, router: router)
        case .connections:
            ConnectionsView(store: store, router: router)
        case nil:
            DailyConversationView(store: store, router: router)
        }
    }

    @ViewBuilder
    private var detailColumn: some View {
        switch router.inspectorSelection {
        case .thread(let id):
            ThreadInspectorView(store: store, threadID: id)
                .id(id)
        case .feed(let id):
            FeedInspectorView(store: store, itemID: id)
                .id(id)
        case .agent(let id):
            AgentDetailView(agent: store.agent(id: id))
                .id(id)
        case .source(let id):
            SourceDetailView(source: store.source(id: id))
                .id(id)
        case nil:
            EmptyView()
        }
    }

    private var inspectorPresented: Binding<Bool> {
        Binding(
            get: { router.inspectorSelection != nil },
            set: { isPresented in
                if !isPresented {
                    router.closeInspector()
                }
            }
        )
    }
}
