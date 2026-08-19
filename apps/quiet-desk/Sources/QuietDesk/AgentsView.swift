import QuietDeskCore
import SwiftUI

@MainActor
struct AgentsView: View {
    let store: QuietDeskStore
    @Bindable var router: AppRouter

    @State private var searchText = ""

    var body: some View {
        Group {
            switch store.loadState {
            case .idle, .loading:
                List(0..<5, id: \.self) { _ in
                    agentPlaceholder
                        .redacted(reason: .placeholder)
                }
                .disabled(true)
            case .failed(let message):
                ContentUnavailableView(
                    "Couldn’t load agents",
                    systemImage: "person.2.slash",
                    description: Text(message)
                )
            case .empty:
                ContentUnavailableView(
                    "No agents",
                    systemImage: "person.2.badge.plus",
                    description: Text("The shared store returned no agent profiles.")
                )
            case .loaded:
                loadedList
            }
        }
        .searchable(text: $searchText, placement: .toolbar, prompt: "Search agents")
    }

    private var agents: [AgentProfile] {
        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return store.snapshot.agents }
        return store.snapshot.agents.filter {
            [$0.name, $0.role, $0.mission]
                .joined(separator: " ")
                .localizedCaseInsensitiveContains(trimmed)
        }
    }

    private var loadedList: some View {
        Group {
            if agents.isEmpty {
                ContentUnavailableView.search(text: searchText)
            } else {
                List {
                    ForEach(agents) { agent in
                        Button {
                            router.show(.agent(agent.id))
                        } label: {
                            AgentRow(agent: agent)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .listStyle(.inset)
            }
        }
    }

    private var agentPlaceholder: some View {
        HStack(spacing: 12) {
            Image(systemName: "person.crop.circle")
            VStack(alignment: .leading) {
                Text("Agent name")
                Text("Quiet operational role")
            }
        }
    }

}

private struct AgentRow: View {
    let agent: AgentProfile

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: agent.systemImage)
                .font(.title3)
                .foregroundStyle(.secondary)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 3) {
                Text(agent.name)
                    .font(.headline)
                Text(agent.role)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text(agent.availability.label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(agent.name), \(agent.role), \(agent.availability.label)"
        )
        .accessibilityHint("Show agent boundaries and technical details")
    }
}

struct AgentDetailView: View {
    let agent: AgentProfile?

    var body: some View {
        Group {
            if let agent {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack(spacing: 12) {
                            Image(systemName: agent.systemImage)
                                .font(.largeTitle)
                                .foregroundStyle(.secondary)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(agent.name).font(.title2.weight(.semibold))
                                Text(agent.role).foregroundStyle(.secondary)
                            }
                        }

                        Text(agent.mission)
                            .font(.body)

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Boundaries")
                                .font(.headline)
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(agent.permissions, id: \.self) { permission in
                                    Label(permission, systemImage: "checkmark.shield")
                                }
                            }
                            .font(.callout)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        DisclosureGroup("Technical details") {
                            VStack(alignment: .leading, spacing: 8) {
                                LabeledContent("Provider", value: agent.executor.provider)
                                LabeledContent("Executor", value: agent.executor.executor)
                                LabeledContent("Runtime", value: agent.executor.runtime)
                                LabeledContent("State", value: agent.availability.label)
                                Text("Provider business logic stays outside this Mac client.")
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
                ContentUnavailableView("Select an agent", systemImage: "person.2")
            }
        }
        .navigationTitle("Agent details")
    }
}
