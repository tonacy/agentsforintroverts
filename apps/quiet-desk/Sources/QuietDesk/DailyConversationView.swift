import QuietDeskCore
import SwiftUI

@MainActor
struct DailyConversationView: View {
    @Bindable var store: QuietDeskStore
    @Bindable var router: AppRouter

    @State private var mode: DailyConversationMode = .notChecked

    init(
        store: QuietDeskStore,
        router: AppRouter,
        initialMode: DailyConversationMode = .notChecked
    ) {
        self.store = store
        self.router = router
        _mode = State(initialValue: initialMode)
    }

    var body: some View {
        Group {
            switch store.loadState {
            case .idle, .loading:
                loadingView
            case .empty:
                emptyView
            case .failed(let message):
                errorView(message)
            case .loaded:
                conversation
            }
        }
        .navigationTitle("Daily conversation")
        .accessibilityLabel("Daily conversation")
    }

    private var conversation: some View {
        let projection = store.snapshot.dailyConversationProjection(for: mode)

        return ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                connectionBanner
                introduction
                modeChooser

                if mode != .notChecked {
                    Divider()
                    conversationResult(projection)
                }
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 24)
            .frame(maxWidth: 780, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var connectionBanner: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 14) {
                Label("Sample conversation", systemImage: "testtube.2")
                Spacer()
                Label("Context Kernel not connected", systemImage: "bolt.horizontal.circle")
            }

            VStack(alignment: .leading, spacing: 7) {
                Label("Sample conversation", systemImage: "testtube.2")
                Label("Context Kernel not connected", systemImage: "bolt.horizontal.circle")
            }
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(.quaternary.opacity(0.38), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("quiet-desk.conversation.connection-status")
    }

    private var introduction: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("TODAY")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .tracking(0.8)

            Text("Choose how much of the outside world enters.")
                .font(.largeTitle.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)

            Text("There are a few synthetic threads available, but nothing here is live or urgent. This choice applies only to this check-in and is not saved as a preference.")
                .font(.body)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var modeChooser: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("How much should come in?")
                .font(.headline)

            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 10) {
                    modeButtons
                }

                VStack(alignment: .leading, spacing: 10) {
                    modeButtons
                }
            }
        }
    }

    @ViewBuilder
    private var modeButtons: some View {
        ForEach(DailyConversationMode.choices) { choice in
            Button {
                mode = choice
            } label: {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(choice.title)
                            .font(.callout.weight(.semibold))
                        Spacer(minLength: 8)
                        Image(systemName: mode == choice ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(mode == choice ? Color.accentColor : Color.secondary)
                            .accessibilityHidden(true)
                    }

                    Text(choice.explanation)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .buttonStyle(ConversationModeButtonStyle(isSelected: mode == choice))
            .accessibilityLabel(choice.title)
            .accessibilityValue(mode == choice ? "Selected" : "Not selected")
            .accessibilityHint(choice.explanation)
            .accessibilityIdentifier("quiet-desk.conversation.mode.\(choice.rawValue)")
        }
    }

    @ViewBuilder
    private func conversationResult(_ projection: DailyConversationProjection) -> some View {
        if projection.mode == .noNewInput {
            noNewInputResult(projection)
        } else {
            VStack(alignment: .leading, spacing: 30) {
                resultHeader(projection)
                outsideSection(projection)
                insideSection(projection)
                placeGate(projection)
            }
        }
    }

    private func resultHeader(_ projection: DailyConversationProjection) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(projection.mode.title.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .tracking(0.8)
            Text(projection.mode == .short ? "One thread is available to discuss." : "Two recurring threads are available to discuss.")
                .font(.title2.weight(.semibold))
            Text("These are supporting conversations from the sample projection—not timely Places and not a reason to publish.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private func outsideSection(_ projection: DailyConversationProjection) -> some View {
        conversationSection("Outside") {
            Text("The sample network has compressed recurring discourse into \(projection.supportingThreads.count) human-scale \(projection.supportingThreads.count == 1 ? "thread" : "threads"). Open one only if you want its context, evidence, and people.")
                .font(.callout)
                .foregroundStyle(.secondary)

            VStack(spacing: 10) {
                ForEach(projection.supportingThreads) { thread in
                    Button {
                        router.show(.thread(thread.id))
                    } label: {
                        SupportingThreadCard(thread: thread)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("quiet-desk.conversation.thread.\(thread.id.uuidString)")
                }
            }
        }
    }

    private func insideSection(_ projection: DailyConversationProjection) -> some View {
        conversationSection("Inside") {
            Text(projection.context.summary)
                .font(.callout)
                .foregroundStyle(.secondary)

            let inferredCount = projection.context.statements.filter(\.needsConfirmation).count
            Label(
                inferredCount == 0
                    ? "No inferred statements need confirmation"
                    : "\(inferredCount) inferred \(inferredCount == 1 ? "statement needs" : "statements need") confirmation",
                systemImage: inferredCount == 0 ? "checkmark.circle" : "questionmark.circle"
            )
            .font(.caption)
            .foregroundStyle(inferredCount == 0 ? Color.secondary : Color.orange)

            if projection.mode == .deep {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(projection.context.statements) { statement in
                        ConversationContextStatementRow(statement: statement)
                    }
                }
                .padding(.top, 2)
            }

            Text("This context can explain a fit. It cannot authorize the agent to speak for you.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func placeGate(_ projection: DailyConversationProjection) -> some View {
        conversationSection("Where they meet") {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 7) {
                    Text("No Place yet")
                        .font(.title3.weight(.semibold))
                    Text(projection.noActionReason ?? "No Place earned attention in this check-in.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 10) {
                    ConversationReadinessRow(
                        title: "Outside context",
                        value: "Sample only",
                        systemImage: "testtube.2"
                    )
                    ConversationReadinessRow(
                        title: "Your lived day",
                        value: "Not captured here",
                        systemImage: "person.crop.circle.badge.questionmark"
                    )
                    ConversationReadinessRow(
                        title: "Place",
                        value: "Held back",
                        systemImage: "pause.circle"
                    )
                }

                Text("A real Place points to an exact opening, shows what you could add, names the human cost, and expires. Quiet Desk will not invent one from sample data or an inferred account of your day.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(16)
            .background(.quaternary.opacity(0.32), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color(nsColor: .separatorColor).opacity(0.55), lineWidth: 1)
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("quiet-desk.conversation.place-gate")
        }
    }

    private func noNewInputResult(_ projection: DailyConversationProjection) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Label("Nothing new enters this check-in", systemImage: "moon.stars")
                .font(.title2.weight(.semibold))

            Text(projection.noActionReason ?? "No new outside context was introduced.")
                .font(.body)

            Text("No context was added, no Place was created, and this choice will not be remembered as a standing preference.")
                .font(.callout)
                .foregroundStyle(.secondary)

            if store.pendingApprovalCount > 0 {
                Button("Review already-open activity") {
                    router.openActivity()
                }
                .buttonStyle(.bordered)
                .accessibilityHint("Opens existing synthetic activity without bringing new context into this check-in")
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.32), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("quiet-desk.conversation.no-new-input")
    }

    @ViewBuilder
    private func conversationSection<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            Text(title)
                .font(.headline)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Preparing the sample conversation…")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityLabel("Preparing the sample conversation")
    }

    private var emptyView: some View {
        ContentUnavailableView(
            "No sample conversation",
            systemImage: "text.bubble",
            description: Text("Reload the bundled sample data from the More menu.")
        )
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 12) {
            ContentUnavailableView(
                "Couldn’t prepare the conversation",
                systemImage: "exclamationmark.triangle",
                description: Text(message)
            )
            Button("Try again") {
                Task { await store.reload() }
            }
        }
        .padding()
    }
}

private struct ConversationModeButtonStyle: ButtonStyle {
    let isSelected: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(13)
            .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
            .background(
                isSelected ? Color.accentColor.opacity(0.12) : Color.secondary.opacity(0.085),
                in: RoundedRectangle(cornerRadius: 10, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(
                        isSelected ? Color.accentColor.opacity(0.8) : Color.secondary.opacity(0.34),
                        lineWidth: isSelected ? 1.5 : 1
                    )
            }
            .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .opacity(configuration.isPressed ? 0.72 : 1)
    }
}

private struct SupportingThreadCard: View {
    let thread: CommonGroundThread

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 7) {
                Label("Recurring thread", systemImage: "text.bubble")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)

                Text(thread.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)

                Text(thread.whyNow)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                Text("\(thread.contextStatementIDs.count) context statements · \(thread.claims.count) evidence claims")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .stroke(Color(nsColor: .separatorColor).opacity(0.6), lineWidth: 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Recurring thread: \(thread.title). \(thread.whyNow)")
        .accessibilityHint("Show the matching context, evidence, people, and any exact handoff proposal")
    }
}

private struct ConversationContextStatementRow: View {
    let statement: ContextStatement

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: statement.needsConfirmation ? "questionmark.circle" : "checkmark.circle")
                .foregroundStyle(statement.needsConfirmation ? Color.orange : Color.secondary)
                .frame(width: 18)
                .accessibilityHidden(true)

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
}

private struct ConversationReadinessRow: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: systemImage)
                .frame(width: 18)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(title)
                .font(.callout)
            Spacer(minLength: 12)
            Text(value)
                .font(.callout.weight(.medium))
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}
