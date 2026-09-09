import QuietDeskCore
import SwiftUI

@MainActor
struct SourcesView: View {
    let store: QuietDeskStore
    @Bindable var router: AppRouter

    @State private var searchText = ""
    @State private var isShowingFeedSetup = false

    var body: some View {
        VStack(spacing: 0) {
            feedSetupSummary
            Divider()

            Group {
                switch store.loadState {
                case .idle, .loading:
                    List(0..<5, id: \.self) { _ in
                        sourcePlaceholder.redacted(reason: .placeholder)
                    }
                    .disabled(true)
                case .failed(let message):
                    ContentUnavailableView(
                        "Couldn’t load sources",
                        systemImage: "externaldrive.badge.exclamationmark",
                        description: Text(message)
                    )
                case .empty:
                    ContentUnavailableView(
                        "No observed sources",
                        systemImage: "point.3.connected.trianglepath.dotted",
                        description: Text("Set up a feed plan above. Live adapters are a separate activation step.")
                    )
                case .loaded:
                    loadedList
                }
            }
        }
        .searchable(text: $searchText, placement: .toolbar, prompt: "Search sources")
        .sheet(isPresented: $isShowingFeedSetup) {
            FeedSetupView(store: store)
        }
    }

    private var feedSetupSummary: some View {
        HStack(spacing: 14) {
            Image(systemName: "slider.horizontal.3")
                .font(.title2)
                .foregroundStyle(.secondary)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 3) {
                Text("Feed setup")
                    .font(.headline)
                Text(feedSetupSummaryText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 16)

            Button {
                store.refreshFeedConnectionReceipts()
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Refresh feed verification receipts")
            .help("Refresh verification receipts written by your agents")

            Button("Set up feeds") {
                isShowingFeedSetup = true
            }
            .buttonStyle(.borderedProminent)
            .accessibilityIdentifier("quiet-desk.feeds.setup")
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(.bar)
    }

    private var feedSetupSummaryText: String {
        if store.requestedFeedCount == 0 {
            return "Choose what may come in and where released context may go. Nothing is connected yet."
        }
        let awaiting = store.requestedFeedCount - store.verifiedFeedCount
        return "\(store.verifiedFeedCount) connected · \(awaiting) awaiting fresh verification · \(store.requestedFeedCount) selected"
    }

    private var configuredFeeds: [FeedConnectionPlan] {
        store.feedConnectionPlans.filter(\.isEnabled)
    }

    private var sources: [SourceProfile] {
        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return store.snapshot.sources }
        return store.snapshot.sources.filter {
            [$0.name, $0.kind, $0.scope, $0.health.label]
                .joined(separator: " ")
                .localizedCaseInsensitiveContains(trimmed)
        }
    }

    private var loadedList: some View {
        Group {
            if sources.isEmpty {
                ContentUnavailableView.search(text: searchText)
            } else {
                List {
                    if !configuredFeeds.isEmpty {
                        Section("Configured feeds") {
                            ForEach(configuredFeeds) { plan in
                                ConfiguredFeedRow(
                                    plan: plan,
                                    phase: store.feedConnectionPhase(for: plan.id),
                                    verifyComputerHistory: {
                                        store.verifyComputerHistory()
                                    }
                                )
                            }
                        }
                    }

                    Section("Observed in sample data") {
                        ForEach(sources) { source in
                            Button {
                                router.show(.source(source.id))
                            } label: {
                                SourceRow(source: source)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .listStyle(.inset)
            }
        }
    }

    private var sourcePlaceholder: some View {
        HStack(spacing: 12) {
            Image(systemName: "externaldrive")
            VStack(alignment: .leading) {
                Text("Synthetic source")
                Text("Source scope and health")
            }
        }
    }

}

private struct ConfiguredFeedRow: View {
    let plan: FeedConnectionPlan
    let phase: FeedConnectionPhase
    let verifyComputerHistory: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: plan.id.systemImage)
                .font(.title3)
                .foregroundStyle(statusColor)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 3) {
                Text(plan.id.title)
                    .font(.headline)
                Label(phase.title, systemImage: phase.systemImage)
                    .font(.caption)
                    .foregroundStyle(statusColor)
                Text("\(plan.id.authorizedScope) · \(phase.detail)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 12)

            if plan.id == .computerHistoryToday {
                Button("Verify on this Mac", action: verifyComputerHistory)
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("quiet-desk.feed.computer_history_today.verify")
            } else if plan.id == .xFollowing, let url = URL(string: "https://x.com/home") {
                Link("Open X", destination: url)
                    .buttonStyle(.bordered)
                    .help("Open X in your default browser; a feed-capable agent still verifies the account and Following tab")
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .contain)
    }

    private var statusColor: Color {
        switch phase {
        case .verified: .green
        case .partial, .stale: .orange
        case .unavailable: .red
        case .notRequested, .awaitingVerification: .secondary
        }
    }
}

private struct SourceRow: View {
    let source: SourceProfile

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: source.systemImage)
                .font(.title3)
                .foregroundStyle(.secondary)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 3) {
                Text(source.name).font(.headline)
                Text(source.kind).foregroundStyle(.secondary)
            }
            Spacer()
            Text(source.health.label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(source.name), \(source.kind), \(source.health.label)")
        .accessibilityHint("Show source scope and technical details")
    }
}

struct SourceDetailView: View {
    let source: SourceProfile?

    var body: some View {
        Group {
            if let source {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack(spacing: 12) {
                            Image(systemName: source.systemImage)
                                .font(.largeTitle)
                                .foregroundStyle(.secondary)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(source.name).font(.title2.weight(.semibold))
                                Text(source.kind).foregroundStyle(.secondary)
                            }
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Authorized scope")
                                .font(.headline)
                            Text(source.scope)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        DisclosureGroup("Technical details") {
                            VStack(alignment: .leading, spacing: 8) {
                                LabeledContent("State", value: source.health.label)
                                LabeledContent("Sample events", value: source.itemCount.formatted())
                                if let lastIngestedAt = source.lastIngestedAt {
                                    LabeledContent("Last ingested") {
                                        Text(lastIngestedAt, format: .dateTime.month().day().hour().minute())
                                    }
                                }
                                Text("Source health stays independent from agent-run health.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.top, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                ContentUnavailableView("Select a source", systemImage: "externaldrive")
            }
        }
        .navigationTitle("Source details")
    }
}
