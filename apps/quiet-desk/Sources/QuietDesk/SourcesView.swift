import QuietDeskCore
import SwiftUI

@MainActor
struct SourcesView: View {
    let store: QuietDeskStore
    @Bindable var router: AppRouter

    @State private var searchText = ""

    var body: some View {
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
                    "No sources",
                    systemImage: "point.3.connected.trianglepath.dotted",
                    description: Text("The shared store returned no source profiles.")
                )
            case .loaded:
                loadedList
            }
        }
        .searchable(text: $searchText, placement: .toolbar, prompt: "Search sources")
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
                    ForEach(sources) { source in
                        Button {
                            router.show(.source(source.id))
                        } label: {
                            SourceRow(source: source)
                        }
                        .buttonStyle(.plain)
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
