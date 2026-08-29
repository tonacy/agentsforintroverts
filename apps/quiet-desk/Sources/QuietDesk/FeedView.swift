import QuietDeskCore
import SwiftUI

@MainActor
struct ThreadsView: View {
    @Bindable var store: QuietDeskStore
    @Bindable var router: AppRouter

    @State private var contextExpanded = false

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
                threadsList
            }
        }
        .navigationTitle("Threads")
        .accessibilityLabel("Recurring conversations worth your time")
    }

    private var allThreads: [CommonGroundThread] {
        store.snapshot.conversationThreads()
    }

    private var threads: [CommonGroundThread] {
        store.snapshot.topLevelThreads()
    }

    private var threadsList: some View {
        List {
            Section {
                ThreadHomeHeader(threadCount: allThreads.count)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .accessibilityAddTraits(.isHeader)
            }

            if !threads.isEmpty {
                Section("Worth returning to") {
                    ForEach(threads) { thread in
                        Button {
                            router.show(.thread(thread.id))
                        } label: {
                            ThreadCardView(
                                thread: thread,
                                handoffItem: store.handoffItem(for: thread.id)
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("quiet-desk.thread.\(thread.id.uuidString)")
                        .listRowInsets(.init(top: 8, leading: 20, bottom: 8, trailing: 20))
                    }
                }
            }

            Section {
                LivingContextDisclosure(
                    context: store.snapshot.personalContext,
                    isExpanded: $contextExpanded
                )
                .listRowSeparator(.hidden)
            }

            Section {
                Button("See source activity") {
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
            "No sample threads",
            systemImage: "text.bubble",
            description: Text("Reload the bundled sample data from the More menu. Source activity remains available separately.")
        )
    }

    private func reload() {
        Task { await store.reload() }
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

private struct ThreadHomeHeader: View {
    let threadCount: Int

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
        switch threadCount {
        case 0: "No conversation has earned your time."
        case 1: "One conversation is worth returning to."
        default: "\(threadCount) conversations are worth returning to."
        }
    }

    private var subtitle: String {
        threadCount == 0
            ? "Agents are still listening across the synthetic network."
            : "Recurring discourse, matched to your context and narrowed toward people."
    }
}

private struct LivingContextDisclosure: View {
    let context: LivingContext
    @Binding var isExpanded: Bool

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: 12) {
                Text(context.summary)
                    .font(.callout)
                    .foregroundStyle(.secondary)

                ForEach(context.statements) { statement in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: statement.needsConfirmation ? "questionmark.circle" : "checkmark.circle")
                            .foregroundStyle(statement.needsConfirmation ? Color.orange : Color.secondary)
                            .frame(width: 18)

                        VStack(alignment: .leading, spacing: 3) {
                            Text(statement.statement)
                                .font(.callout)
                                .fixedSize(horizontal: false, vertical: true)
                            Text("\(statement.kind.label) · \(statement.basis.label)")
                                .font(.caption)
                                .foregroundStyle(statement.needsConfirmation ? Color.orange : Color.secondary)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }

                Text("Context is inspectable input, not permission to speak for you. Inferences stay labeled as needing confirmation.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 10)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text("Your context")
                    .font(.headline)
                Text("Revision \(context.revision) · \(context.statements.count) statements · used to explain fit")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityIdentifier("quiet-desk.context")
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
