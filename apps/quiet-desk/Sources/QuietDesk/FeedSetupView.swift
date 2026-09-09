import QuietDeskCore
import SwiftUI

@MainActor
struct FeedSetupView: View {
    @Environment(\.dismiss) private var dismiss

    let store: QuietDeskStore
    @State private var plans: [FeedConnectionPlan]

    init(store: QuietDeskStore) {
        self.store = store
        _plans = State(initialValue: store.feedConnectionPlans)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    boundaryGuide

                    ForEach(FeedBoundary.allCases) { boundary in
                        feedSection(boundary)
                    }

                    Label(
                        "Saving records your requested boundaries on this Mac. It does not open a browser, request credentials, authenticate an account, read a feed, or publish.",
                        systemImage: "lock.shield"
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
                }
                .padding(24)
                .frame(maxWidth: 780, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("Set up feeds")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save plan") {
                        store.replaceFeedConnectionPlans(plans)
                        dismiss()
                    }
                    .keyboardShortcut(.defaultAction)
                    .disabled(hasValidationErrors)
                    .accessibilityIdentifier("quiet-desk.feeds.save")
                }
            }
        }
        .frame(minWidth: 680, idealWidth: 760, minHeight: 620, idealHeight: 720)
    }

    private var boundaryGuide: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("One Desk. Three separate lanes.")
                .font(.title2.weight(.semibold))
            Text("Reading and publishing are different permissions. Inside context crosses into public use only during a reflection and release at the Desk.")
                .foregroundStyle(.secondary)

            HStack(spacing: 10) {
                boundaryPill("Outside", systemImage: "globe", tint: .blue)
                Image(systemName: "arrow.right")
                    .foregroundStyle(.tertiary)
                boundaryPill("Desk reflection", systemImage: "circle.grid.cross", tint: .green)
                Image(systemName: "arrow.right")
                    .foregroundStyle(.tertiary)
                boundaryPill("Public output", systemImage: "paperplane", tint: .orange)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Outside context enters Desk reflection. Only released context may move to public output.")
        }
    }

    private func boundaryPill(_ title: String, systemImage: String, tint: Color) -> some View {
        Label(title, systemImage: systemImage)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(tint)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(tint.opacity(0.11), in: Capsule())
    }

    private func feedSection(_ boundary: FeedBoundary) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(boundary.title)
                    .font(.headline)
                Text(boundary.explanation)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            ForEach($plans) { $plan in
                if plan.id.boundary == boundary {
                    FeedPlanCard(
                        plan: $plan,
                        phase: store.feedConnectionPhase(for: plan.id)
                    )
                }
            }
        }
    }

    private var hasValidationErrors: Bool {
        plans.contains { $0.validationMessage != nil }
    }
}

private struct FeedPlanCard: View {
    @Binding var plan: FeedConnectionPlan
    let phase: FeedConnectionPhase

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: plan.id.systemImage)
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .frame(width: 28, height: 28)

                VStack(alignment: .leading, spacing: 4) {
                    Text(plan.id.title)
                        .font(.headline)
                    Text(plan.id.purpose)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 12)

                Toggle("Include \(plan.id.title)", isOn: $plan.isEnabled)
                    .labelsHidden()
                    .accessibilityLabel("Include \(plan.id.title)")
                    .accessibilityIdentifier("quiet-desk.feed.\(plan.id.rawValue).enabled")
            }

            if plan.isEnabled {
                Divider()

                if plan.id.requiresAccountIdentifier {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(plan.id.accountPrompt)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        TextField(plan.id.accountPrompt, text: $plan.accountIdentifier)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("quiet-desk.feed.\(plan.id.rawValue).account")
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Permission")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Picker("Permission", selection: $plan.permission) {
                        ForEach(plan.id.allowedPermissions) { permission in
                            Text(permission.title).tag(permission)
                        }
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                    .accessibilityIdentifier("quiet-desk.feed.\(plan.id.rawValue).permission")
                    Text(plan.permission.explanation)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let validationMessage = plan.validationMessage {
                    Label(validationMessage, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .accessibilityIdentifier("quiet-desk.feed.\(plan.id.rawValue).validation")
                } else {
                    Label(receiptStatusText, systemImage: receiptStatusImage)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(receiptStatusColor)
                        .accessibilityIdentifier("quiet-desk.feed.\(plan.id.rawValue).status")
                }

                DisclosureGroup("Scope and retention") {
                    VStack(alignment: .leading, spacing: 9) {
                        LabeledContent("May access", value: plan.id.authorizedScope)
                        LabeledContent("Retention", value: plan.id.retention)
                        LabeledContent("Connection proof", value: "None")
                    }
                    .font(.caption)
                    .padding(.top, 8)
                }
            }
        }
        .padding(16)
        .background(.background, in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(.separator.opacity(0.5), lineWidth: 1)
        }
    }

    private var receiptStatusText: String {
        switch phase {
        case .verified:
            "Connected · \(phase.detail)"
        case .partial, .stale, .unavailable:
            "\(phase.title) · \(phase.detail)"
        case .notRequested, .awaitingVerification:
            "Ready to verify · not connected"
        }
    }

    private var receiptStatusImage: String {
        phase.isVerified ? "checkmark.circle.fill" : phase.systemImage
    }

    private var receiptStatusColor: Color {
        switch phase {
        case .verified: .green
        case .partial, .stale: .orange
        case .unavailable: .red
        case .notRequested, .awaitingVerification: .secondary
        }
    }
}
