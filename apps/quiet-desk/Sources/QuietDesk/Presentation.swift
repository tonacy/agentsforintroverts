import QuietDeskCore
import SwiftUI

extension FeedItemStatus {
    var systemImage: String {
        switch self {
        case .needsYou: "hand.raised.fill"
        case .watching: "eye.fill"
        case .handled: "checkmark.circle.fill"
        case .context: "text.justify.leading"
        }
    }

}

struct ProofLedgerView: View {
    let ledger: ProofLedger

    var body: some View {
        ViewThatFits(in: .horizontal) {
            evidenceList(axis: .horizontal)
            evidenceList(axis: .vertical)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
        .accessibilityHint("Each marker is independent. One kind of evidence does not establish another.")
    }

    @ViewBuilder
    private func evidenceList(axis: Axis) -> some View {
        let kinds = ProofKind.allCases
        if axis == .horizontal {
            HStack(spacing: 9) {
                ForEach(kinds, id: \.self) { kind in
                    evidenceMarker(kind)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 5) {
                ForEach(kinds, id: \.self) { kind in
                    evidenceMarker(kind)
                }
            }
        }
    }

    private func evidenceMarker(_ kind: ProofKind) -> some View {
        let isEvidenced = ledger.contains(kind)
        return Label(
            kind.label,
            systemImage: isEvidenced ? "checkmark.seal.fill" : "circle"
        )
        .font(.caption2.weight(isEvidenced ? .semibold : .regular))
        .foregroundStyle(isEvidenced ? Color.accentColor : Color.secondary.opacity(0.55))
        .lineLimit(1)
        .help(isEvidenced ? "Independent evidence recorded" : "No evidence recorded")
    }

    private var accessibilitySummary: String {
        ProofKind.allCases
            .map { kind in
                "\(kind.label): \(ledger.contains(kind) ? "evidenced" : "not evidenced")"
            }
            .joined(separator: ". ")
    }
}

struct EvidenceClaimView: View {
    let claim: EvidenceClaim

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(claim.kind.label.uppercased())
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(claim.kind == .inferred ? .orange : .secondary)
                Spacer()
                Text(claim.sourceCapturedAt, format: .dateTime.month(.abbreviated).day().hour().minute())
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.tertiary)
            }

            Text(claim.claim)
                .font(.callout.weight(.medium))
                .fixedSize(horizontal: false, vertical: true)

            if let sourceURL = claim.userOpenableSourceURL {
                Link(destination: sourceURL) {
                    Label(claim.sourceTitle, systemImage: "arrow.up.right.square")
                }
                .font(.caption)
                .accessibilityLabel("Open source: \(claim.sourceTitle)")
                .accessibilityHint("Opens this HTTP or HTTPS source after your action.")
            } else {
                Label(claim.sourceTitle, systemImage: "link.badge.plus")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Source unavailable as a link: \(claim.sourceTitle)")
            }

            Text(claim.excerpt)
                .font(.caption)
                .foregroundStyle(.secondary)
                .italic()
                .textSelection(.enabled)
        }
        .accessibilityElement(children: .contain)
    }
}

struct ActionPreviewView: View {
    let action: ProposedAction
    let proofLedger: ProofLedger
    var showsTechnicalDetails = true

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text(action.kind.label)
                    .font(.callout.weight(.medium))
                Spacer()
                Text(approvalLabel)
                    .font(.caption)
                    .foregroundStyle(proofLedger.contains(.approved) ? Color.secondary : Color.orange)
            }

            LabeledContent("To", value: action.target)
                .font(.caption)

            Text(action.exactPayload)
                .font(.system(.callout, design: .monospaced))
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.quaternary.opacity(0.45), in: RoundedRectangle(cornerRadius: 8))

            if showsTechnicalDetails {
                Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 12, verticalSpacing: 4) {
                    GridRow {
                        Text("Account").foregroundStyle(.secondary)
                        Text(action.account).textSelection(.enabled)
                    }
                    GridRow {
                        Text("Channel").foregroundStyle(.secondary)
                        Text(action.channel)
                    }
                    GridRow {
                        Text("Revision").foregroundStyle(.secondary)
                        Text("\(action.revision)").monospacedDigit()
                    }
                }
                .font(.caption)

                LabeledContent("Payload SHA-256") {
                    Text(action.payloadSHA256)
                        .font(.caption2.monospaced())
                        .textSelection(.enabled)
                }
                .font(.caption2)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            "Exact proposed action revision \(action.revision) from \(action.account) for \(action.target). \(approvalLabel)."
        )
    }

    private var approvalLabel: String {
        if proofLedger.contains(.approved) {
            "Approval evidenced"
        } else if proofLedger.contains(.proposed) {
            "Approval required"
        } else {
            "Approval not evidenced"
        }
    }
}
