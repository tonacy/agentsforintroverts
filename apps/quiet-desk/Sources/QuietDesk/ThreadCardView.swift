import QuietDeskCore
import SwiftUI

struct ThreadCardView: View {
    let thread: CommonGroundThread
    let handoffItem: FeedItem?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Label(stageLabel, systemImage: stageSystemImage)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(needsApproval ? Color.orange : Color.secondary)

                Spacer()

                Text(thread.updatedAt, format: .dateTime.hour().minute())
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            Text(thread.title)
                .font(.headline)
                .fixedSize(horizontal: false, vertical: true)

            Text(thread.commonGround)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(alignment: .lastTextBaseline, spacing: 12) {
                Text(narrowingLabel)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)

                Spacer(minLength: 16)

                Text(peopleLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(stageLabel): \(thread.title). \(thread.commonGround). \(narrowingAccessibilityLabel). \(peopleLabel)."
        )
        .accessibilityHint("Show the matching context, evidence, people, and any exact handoff proposal")
    }

    private var needsApproval: Bool {
        guard let handoffItem else { return false }
        return handoffItem.proofLedger.contains(.proposed)
            && !handoffItem.proofLedger.contains(.approved)
    }

    private var stageLabel: String {
        if thread.stage == .handoffReady, handoffItem?.proofLedger.contains(.approved) == true {
            return "Handoff approved locally"
        }
        return thread.stage.label
    }

    private var stageSystemImage: String {
        switch thread.stage {
        case .listening: "ear"
        case .commonGround: "circle.hexagongrid"
        case .peopleFound: "person.2"
        case .handoffReady: needsApproval ? "hand.raised.fill" : "checkmark.circle"
        }
    }

    private var narrowingLabel: String {
        let narrowing = thread.narrowing
        return "\(narrowing.voicesObserved) → \(narrowing.sharedIntent) → \(narrowing.peopleWithinReach)"
    }

    private var narrowingAccessibilityLabel: String {
        let narrowing = thread.narrowing
        return "Narrowed from \(narrowing.voicesObserved) observed voices to \(narrowing.sharedIntent) sharing intent and \(narrowing.peopleWithinReach) people within reach"
    }

    private var peopleLabel: String {
        let names = thread.people.map(\.name)
        switch names.count {
        case 0: return "No people surfaced"
        case 1: return names[0]
        case 2: return names.joined(separator: " + ")
        default: return "\(names[0]), \(names[1]) + \(names.count - 2)"
        }
    }
}
