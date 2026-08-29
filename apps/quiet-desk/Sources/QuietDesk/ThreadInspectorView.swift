import QuietDeskCore
import SwiftUI

@MainActor
struct ThreadInspectorView: View {
    @Bindable var store: QuietDeskStore
    let threadID: UUID?

    @State private var approvalError: String?
    @State private var showsTechnicalDetails = false

    var body: some View {
        Group {
            if let thread = store.thread(id: threadID) {
                inspector(thread)
            } else {
                ContentUnavailableView(
                    "No thread selected",
                    systemImage: "text.bubble"
                )
            }
        }
        .navigationTitle("Human thread")
    }

    private func inspector(_ thread: CommonGroundThread) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                header(thread)

                section("Why this reached you") {
                    Text(thread.whyItFits)
                        .font(.body)
                    Text(thread.whyNow)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                contextSection(thread)

                section("From the network to human scale") {
                    NarrowingView(narrowing: thread.narrowing)
                    Text("The broad counts provide context. The final people are the potential beginning of a relationship, not a claim of consensus.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                peopleSection(thread)

                if let handoff = store.handoffItem(for: thread.id),
                   let action = handoff.action {
                    handoffSection(action: action, item: handoff)
                }

                section("Source evidence") {
                    ForEach(thread.claims) { claim in
                        EvidenceClaimView(claim: claim)
                        if claim.id != thread.claims.last?.id {
                            Divider()
                        }
                    }
                }

                DisclosureGroup("Technical details", isExpanded: $showsTechnicalDetails) {
                    VStack(alignment: .leading, spacing: 9) {
                        LabeledContent("Thread ID") {
                            Text(thread.id.uuidString)
                                .font(.caption2.monospaced())
                                .textSelection(.enabled)
                        }
                        LabeledContent("Context revision", value: "\(store.snapshot.personalContext.revision)")
                        LabeledContent("Matched context", value: "\(thread.contextStatementIDs.count) statements")
                        LabeledContent("Evidence", value: "\(thread.claims.count) claims")
                        LabeledContent("People", value: "\(thread.people.count)")
                        if let handoffID = thread.handoffFeedItemID {
                            LabeledContent("Handoff feed item") {
                                Text(handoffID.uuidString)
                                    .font(.caption2.monospaced())
                                    .textSelection(.enabled)
                            }
                        }
                        Text("This sample thread is a synthetic product projection. It does not prove a live provider connection or real-world common ground.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                if let notice = store.lastNotice {
                    Label(notice, systemImage: "checkmark.shield")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let approvalError {
                    Label(approvalError, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func header(_ thread: CommonGroundThread) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(stageLabel(thread).uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundStyle(needsApproval(thread) ? Color.orange : Color.secondary)
            Text(thread.title)
                .font(.title2.weight(.semibold))
            Text(thread.commonGround)
                .font(.body)
                .foregroundStyle(.secondary)
        }
    }

    private func contextSection(_ thread: CommonGroundThread) -> some View {
        section("Context used for the match") {
            ForEach(store.contextStatements(for: thread.id)) { statement in
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: statement.needsConfirmation ? "questionmark.circle" : "checkmark.circle")
                        .foregroundStyle(statement.needsConfirmation ? Color.orange : Color.secondary)
                        .frame(width: 18)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(statement.statement)
                            .font(.callout)
                        Text("\(statement.kind.label) · \(statement.basis.label) · \(statement.confidence, format: .percent.precision(.fractionLength(0))) confidence")
                            .font(.caption)
                            .foregroundStyle(statement.needsConfirmation ? Color.orange : Color.secondary)

                        let supportingItems = statement.sourceFeedItemIDs.compactMap { store.item(id: $0) }
                        if !supportingItems.isEmpty {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Supporting activity")
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                ForEach(supportingItems) { item in
                                    Text("• \(item.headline)")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.top, 2)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func peopleSection(_ thread: CommonGroundThread) -> some View {
        section("People within reach") {
            ForEach(thread.people) { person in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(person.name)
                            .font(.callout.weight(.semibold))
                        Spacer()
                        if let location = person.location {
                            Text(location)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Text(person.relationship)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let targetIdentifier = person.targetIdentifier {
                        LabeledContent("Opt-in route", value: targetIdentifier)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text(person.sharedIntent)
                        .font(.callout)
                    Text(person.whyRelevant)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    let evidence = thread.claims.filter { person.evidenceClaimIDs.contains($0.id) }
                    if !evidence.isEmpty {
                        Text("Basis: \(evidence.map(\.claim).joined(separator: " "))")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
                .padding(.vertical, 3)
                .accessibilityElement(children: .combine)

                if person.id != thread.people.last?.id {
                    Divider()
                }
            }
        }
    }

    private func handoffSection(action: ProposedAction, item: FeedItem) -> some View {
        section("Human handoff") {
            Text("The agent found an opening and stopped. Review the exact words before recording approval; this Mac still cannot contact a provider.")
                .font(.callout)
                .foregroundStyle(.secondary)

            ActionPreviewView(
                action: action,
                proofLedger: item.proofLedger,
                showsTechnicalDetails: false
            )

            Button("Approve exact handoff locally") {
                approvalError = nil
                do {
                    _ = try store.approveAction(for: item.id)
                } catch {
                    approvalError = error.localizedDescription
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(!store.canApprove(itemID: item.id))
            .help("Adds only Approved evidence locally. No provider request is made.")
            .accessibilityLabel("Approve the exact human handoff locally")
            .accessibilityHint("No message is sent. Only Approved evidence is added.")

            Text(store.readOnlyMode
                ? "Read-only is on. Nothing can be approved or sent."
                : "Approval is local evidence only. Nothing is sent from this Mac.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func section<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func stageLabel(_ thread: CommonGroundThread) -> String {
        if thread.stage == .handoffReady,
           store.handoffItem(for: thread.id)?.proofLedger.contains(.approved) == true {
            return "Handoff approved locally"
        }
        return thread.stage.label
    }

    private func needsApproval(_ thread: CommonGroundThread) -> Bool {
        guard let handoff = store.handoffItem(for: thread.id) else { return false }
        return handoff.proofLedger.contains(.proposed)
            && !handoff.proofLedger.contains(.approved)
    }
}

private struct NarrowingView: View {
    let narrowing: ThreadNarrowing

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                step(narrowing.voicesObserved, "voices")
                arrow
                step(narrowing.sharedInterest, "interested")
                arrow
                step(narrowing.sharedIntent, "share intent")
                arrow
                step(narrowing.peopleWithinReach, "within reach")
            }

            VStack(alignment: .leading, spacing: 8) {
                step(narrowing.voicesObserved, "voices observed")
                step(narrowing.sharedInterest, "share the interest")
                step(narrowing.sharedIntent, "share the intent")
                step(narrowing.peopleWithinReach, "people within reach")
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Narrowed from \(narrowing.voicesObserved) observed voices to \(narrowing.sharedInterest) with shared interest, \(narrowing.sharedIntent) with shared intent, and \(narrowing.peopleWithinReach) people within reach."
        )
    }

    private func step(_ value: Int, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value.formatted())
                .font(.title3.weight(.semibold).monospacedDigit())
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(8)
        .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 7))
    }

    private var arrow: some View {
        Image(systemName: "arrow.right")
            .font(.caption)
            .foregroundStyle(.tertiary)
            .accessibilityHidden(true)
    }
}
