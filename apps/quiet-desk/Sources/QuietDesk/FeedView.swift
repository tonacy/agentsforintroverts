import QuietDeskCore
import SwiftUI

@MainActor
struct NowView: View {
    @Bindable var store: QuietDeskStore
    @Bindable var router: AppRouter

    var body: some View {
        Group {
            switch store.loadState {
            case .idle, .loading:
                CalmLoadingList(rowCount: 2)
            case .empty:
                emptySampleView
            case .failed(let message):
                CalmLoadError(message: message, retry: reload)
            case .loaded:
                nowList
            }
        }
        .navigationTitle("Now")
        .accessibilityLabel("What needs you now")
    }

    private var allAttentionItems: [FeedItem] {
        store.snapshot.attentionItems()
    }

    private var attentionItems: [FeedItem] {
        store.snapshot.topLevelAttentionItems()
    }

    private var nowList: some View {
        List {
            Section {
                CalmNowHeader(attentionCount: allAttentionItems.count)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .accessibilityAddTraits(.isHeader)
            }

            if !attentionItems.isEmpty {
                Section {
                    ForEach(attentionItems) { item in
                        Button {
                            router.show(.feed(item.id))
                        } label: {
                            FeedCardView(
                                item: item,
                                showsStatus: false
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("quiet-desk.attention-item.\(item.id.uuidString)")
                        .listRowInsets(.init(top: 6, leading: 20, bottom: 6, trailing: 20))
                    }
                }
            }

            Section {
                Button(activityButtonTitle) {
                    if allAttentionItems.count > attentionItems.count {
                        router.activityScope = .needsYou
                    }
                    router.openActivity()
                }
                .buttonStyle(.link)
                .foregroundStyle(.secondary)
                .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .environment(\.defaultMinListRowHeight, 1)
    }

    private var emptySampleView: some View {
        ContentUnavailableView(
            "No sample items",
            systemImage: "tray",
            description: Text("Reload the bundled sample data from the More menu.")
        )
    }

    private func reload() {
        Task { await store.reload() }
    }

    private var activityButtonTitle: String {
        let remaining = allAttentionItems.count - attentionItems.count
        return remaining > 0 ? "See \(remaining) more" : "See all activity"
    }
}

@MainActor
struct ActivityView: View {
    @Bindable var store: QuietDeskStore
    @Bindable var router: AppRouter

    @State private var searchText = ""

    var body: some View {
        Group {
            switch store.loadState {
            case .idle, .loading:
                CalmLoadingList(rowCount: 4)
            case .empty:
                emptyView
            case .failed(let message):
                CalmLoadError(message: message, retry: reload)
            case .loaded:
                loadedList
            }
        }
        .navigationTitle("Activity")
        .searchable(text: $searchText, placement: .toolbar, prompt: "Search activity")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Picker("Activity", selection: $router.activityScope) {
                        ForEach(ActivityScope.allCases) { scope in
                            Text(scope.title).tag(scope)
                        }
                    }
                } label: {
                    Label(router.activityScope.title, systemImage: "line.3.horizontal.decrease")
                }
                .help("Filter activity")
            }
        }
        .accessibilityLabel("Activity")
    }

    private var items: [FeedItem] {
        store.snapshot.activityItems(for: router.activityScope, query: searchText)
    }

    private var loadedList: some View {
        Group {
            if items.isEmpty {
                ContentUnavailableView(
                    searchText.isEmpty ? "Nothing here" : "No matches",
                    systemImage: searchText.isEmpty ? "tray" : "magnifyingglass",
                    description: Text(searchText.isEmpty ? "Try another activity filter." : "Try a different search.")
                )
            } else {
                List {
                    ForEach(items) { item in
                        Button {
                            router.show(.feed(item.id))
                        } label: {
                            FeedCardView(item: item)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("quiet-desk.activity-item.\(item.id.uuidString)")
                        .listRowInsets(.init(top: 6, leading: 20, bottom: 6, trailing: 20))
                    }
                }
                .listStyle(.plain)
                .environment(\.defaultMinListRowHeight, 1)
            }
        }
    }

    private var emptyView: some View {
        ContentUnavailableView(
            "No sample activity",
            systemImage: "tray",
            description: Text("Reload the bundled sample data from the More menu.")
        )
    }

    private func reload() {
        Task { await store.reload() }
    }
}

private struct CalmNowHeader: View {
    let attentionCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.title2.weight(.semibold))
            Text(subtitle)
                .font(.body)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 20)
        .frame(maxWidth: 620, alignment: .leading)
    }

    private var title: String {
        switch attentionCount {
        case 0: "Your desk is quiet."
        case 1: "One thing is ready when you are."
        default: "\(attentionCount) things are ready when you are."
        }
    }

    private var subtitle: String {
        attentionCount == 0
            ? "Nothing needs you right now."
            : "Everything else is staying out of the way."
    }
}

private struct CalmLoadingList: View {
    let rowCount: Int

    var body: some View {
        List {
            ForEach(0..<rowCount, id: \.self) { index in
                VStack(alignment: .leading, spacing: 8) {
                    Text("A quiet item \(index + 1)")
                        .font(.headline)
                    Text("Only the reason it matters appears here.")
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 10)
                .redacted(reason: .placeholder)
            }
        }
        .listStyle(.plain)
        .disabled(true)
        .accessibilityLabel("Loading sample activity")
    }
}

private struct CalmLoadError: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            ContentUnavailableView(
                "Couldn’t load Quiet Desk",
                systemImage: "exclamationmark.triangle",
                description: Text(message)
            )
            Button("Try again", action: retry)
        }
        .padding()
    }
}
