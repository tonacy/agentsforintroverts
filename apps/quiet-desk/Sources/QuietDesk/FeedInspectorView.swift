import QuietDeskCore
import SwiftUI

@MainActor
struct FeedInspectorView: View {
    @Bindable var store: QuietDeskStore
    let itemID: UUID?

    @State private var approvalError: String?
    @State private var showsTechnicalDetails = false

    var body: some View {
        Group {
            if let item = store.item(id: itemID) {
                inspector(item)
            } else {
                ContentUnavailableView(
                    "No details selected",
                    systemImage: "sidebar.right"
                )
            }
        }
        .navigationTitle("Details")
    }

    private func inspector(_ item: FeedItem) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 7) {
                    Text(item.status.label.uppercased())
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(item.status == .needsYou ? Color.orange : Color.secondary)
                    Text(item.headline)
                        .font(.title2.weight(.semibold))
                    Text(item.whyItMatters)
                        .font(.body)
                        .foregroundStyle(.secondary)
                }

                if let action = item.action {
                    actionSection(action, item: item)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("Sources")
                        .font(.headline)

                    ForEach(item.claims) { claim in
                        EvidenceClaimView(claim: claim)
                        if claim.id != item.claims.last?.id {
                            Divider()
                        }
                    }
                }

                DisclosureGroup("Technical details", isExpanded: $showsTechnicalDetails) {
                    VStack(alignment: .leading, spacing: 10) {
                        LabeledContent("Run state", value: item.run.state.label)
                        LabeledContent("Provider", value: item.executor.provider)
                        LabeledContent("Executor", value: item.executor.executor)
                        LabeledContent("Runtime", value: item.executor.runtime)
                        LabeledContent("Run ID") {
                            Text(item.run.id.uuidString)
                                .font(.caption2.monospaced())
                                .textSelection(.enabled)
                        }

                        Text(item.run.summary)
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Divider()

                        Text("Independent proof")
                            .font(.caption.weight(.semibold))
                        ProofLedgerView(ledger: item.proofLedger)

                        if item.proofLedger.contains(.providerAcknowledged)
                            && !item.proofLedger.contains(.delivered) {
                            Text("Provider acknowledgement does not prove delivery or reading.")
                                .font(.caption)
                                .foregroundStyle(.orange)
                        }

                        if let action = item.action {
                            Divider()
                            LabeledContent("Action revision", value: "\(action.revision)")
                            LabeledContent("Payload SHA-256") {
                                Text(action.payloadSHA256)
                                    .font(.caption2.monospaced())
                                    .textSelection(.enabled)
                            }
                        }

                        if let receipt = store.latestApprovalReceipt(for: item.id) {
                            Divider()
                            Text("Local approval receipt")
                                .font(.caption.weight(.semibold))
                            LabeledContent("Action ID") {
                                Text(receipt.actionID.uuidString)
                                    .font(.caption2.monospaced())
                                    .textSelection(.enabled)
                            }
                            LabeledContent("Revision", value: "\(receipt.actionRevision)")
                            LabeledContent("Bound SHA-256") {
                                Text(receipt.payloadSHA256)
                                    .font(.caption2.monospaced())
                                    .textSelection(.enabled)
                            }
                            Text(receipt.note)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.top, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                if let notice = store.lastNotice {
                    Label(notice, systemImage: "checkmark.shield")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel("Local approval result: \(notice)")
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

    private func actionSection(_ action: ProposedAction, item: FeedItem) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Proposed action")
                .font(.headline)

            ActionPreviewView(
                action: action,
                proofLedger: item.proofLedger,
                showsTechnicalDetails: false
            )

            Label(safetyMessage, systemImage: "lock")
                .font(.caption)
                .foregroundStyle(.secondary)

            Button("Approve exact proposal locally") {
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
            .accessibilityLabel("Approve the exact proposal locally")
            .accessibilityHint("No message is sent. Only Approved evidence is added.")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var safetyMessage: String {
        if store.readOnlyMode {
            "Read-only is on. Nothing can be sent or approved from this Mac."
        } else {
            "Approval is recorded locally only. Nothing is sent from this Mac."
        }
    }
}
