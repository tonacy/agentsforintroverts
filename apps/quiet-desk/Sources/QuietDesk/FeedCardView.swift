import QuietDeskCore
import SwiftUI

struct FeedCardView: View {
    let item: FeedItem
    var showsStatus = true

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                if showsStatus {
                    Label(item.status.label, systemImage: item.status.systemImage)
                        .font(.caption)
                        .foregroundStyle(item.status == .needsYou ? Color.orange : Color.secondary)
                }
                Spacer()
                Text(item.timestamp, format: .dateTime.hour().minute())
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.tertiary)
            }

            Text(item.headline)
                .font(.headline)
                .fixedSize(horizontal: false, vertical: true)

            HStack(alignment: .lastTextBaseline, spacing: 14) {
                Text(item.whyItMatters)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 16)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(item.status.label): \(item.headline). \(item.whyItMatters)")
        .accessibilityHint("Show sources, proof, and any exact proposal")
    }
}
