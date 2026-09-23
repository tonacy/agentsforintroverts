import QuietDeskCore
import SwiftUI

@MainActor
struct DailyConversationView: View {
    @Bindable var store: QuietDeskStore
    @Bindable var providerStore: ProviderStore
    @Bindable var router: AppRouter

    @Environment(\.colorScheme) private var colorScheme
    @State private var mode: DailyConversationMode = .notChecked
    @State private var cueCalibrations: [String: CueCalibration] = [:]

    init(
        store: QuietDeskStore,
        providerStore: ProviderStore,
        router: AppRouter,
        initialMode: DailyConversationMode = .notChecked
    ) {
        self.store = store
        self.providerStore = providerStore
        self.router = router
        _mode = State(initialValue: initialMode)
    }

    var body: some View {
        Group {
            if providerStore.hasWorkspace {
                conversation
            } else {
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
        }
        .navigationTitle(providerStore.hasWorkspace ? "On the desk" : "Daily conversation")
        .accessibilityLabel("Daily conversation")
        .onAppear {
            store.refreshFeedStateSilently()
        }
    }

    private var conversation: some View {
        let projection = store.dailyConversationProjection(for: mode)

        return ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if providerStore.hasWorkspace {
                    CodexCompanionView(providerStore: providerStore, router: router)
                } else {
                    RunTodayPanel(providerStore: providerStore, router: router, mode: mode)
                }
                if !providerStore.hasWorkspace {
                    connectionBanner
                }
                if !providerStore.hasWorkspace {
                    introduction
                    modeChooser
                }

                if mode != .notChecked && !providerStore.hasWorkspace {
                    Divider()
                    conversationResult(projection)
                }
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 24)
            .frame(maxWidth: providerStore.hasWorkspace ? 1320 : 780, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .background(providerStore.hasWorkspace ? DeskPalette(scheme: colorScheme).canvas : Color(nsColor: .windowBackgroundColor))
    }

    private var connectionBanner: some View {
        let cueCount = store.activeOutsideCueCount + store.activeInsideCueCount
        let cueLabel = cueCount == 0
            ? "Sample conversation"
            : "\(cueCount) live \(cueCount == 1 ? "cue" : "cues") · sample context"

        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 14) {
                Label(cueLabel, systemImage: cueCount == 0 ? "testtube.2" : "sparkle.magnifyingglass")
                Spacer()
                Label("Context Kernel not connected", systemImage: "bolt.horizontal.circle")
            }

            VStack(alignment: .leading, spacing: 7) {
                Label(cueLabel, systemImage: cueCount == 0 ? "testtube.2" : "sparkle.magnifyingglass")
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

            Text(introductionDetail)
                .font(.body)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var introductionDetail: String {
        let outside = store.activeOutsideCueCount
        let inside = store.activeInsideCueCount
        guard outside + inside > 0 else {
            return "There are a few synthetic threads available, but nothing here is live or urgent. This choice applies only to this check-in and is not saved as a preference."
        }
        let outsideText = outside == 1 ? "one fresh Outside cue" : "\(outside) fresh Outside cues"
        let insideText = inside == 1 ? "one uncertain Inside recall cue" : "\(inside) uncertain Inside recall cues"
        if outside == 0 {
            return "There are \(insideText) available for calibration. No outside cue is current. Your depth choice applies only to this check-in."
        }
        if inside == 0 {
            return "There are \(outsideText) available. Nothing here claims to know what your day meant, and your depth choice applies only to this check-in."
        }
        return "There are \(outsideText) and \(insideText) available. Recall cues ask; they do not decide what your day meant. Your depth choice applies only to this check-in."
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
            Text(resultHeadline(projection))
                .font(.title2.weight(.semibold))
            Text("Fresh cues are short-lived prompts. Recurring threads below remain sample context—not timely Places and not a reason to publish.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private func resultHeadline(_ projection: DailyConversationProjection) -> String {
        let cueCount = projection.outsideCues.count + projection.insideCues.count
        if cueCount > 0 {
            return "\(cueCount) fresh \(cueCount == 1 ? "cue is" : "cues are") available to discuss."
        }
        return projection.mode == .short
            ? "One sample thread is available to discuss."
            : "Two recurring sample threads are available to discuss."
    }

    private func outsideSection(_ projection: DailyConversationProjection) -> some View {
        conversationSection("Outside") {
            if projection.outsideCues.isEmpty {
                Text("No short-lived Outside cue is current. The recurring conversations below come from the sample projection.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                Text("These observations came through a bounded feed read. Open a source door to challenge the compression; the cue itself will expire and is not durable evidence.")
                    .font(.callout)
                    .foregroundStyle(.secondary)

                VStack(spacing: 10) {
                    ForEach(projection.outsideCues) { cue in
                        FeedCueCard(cue: cue)
                    }
                }
            }

            if !projection.supportingThreads.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("SUPPORTING SAMPLE THREADS")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .tracking(0.7)

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
    }

    private func insideSection(_ projection: DailyConversationProjection) -> some View {
        conversationSection("Inside") {
            if projection.insideCues.isEmpty {
                Text("No current-day recall cue is available. Quiet Desk will not infer an account of your day from the sample context.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                Text("Computer History can suggest a shape of the day, but only you can say whether it is meaningful.")
                    .font(.callout)
                    .foregroundStyle(.secondary)

                VStack(spacing: 10) {
                    ForEach(projection.insideCues) { cue in
                        VStack(alignment: .leading, spacing: 12) {
                            FeedCueCard(cue: cue)
                            insideCalibration(cue)
                        }
                    }
                }
            }

            if projection.mode == .deep {
                VStack(alignment: .leading, spacing: 12) {
                    Text("SAMPLE LIVING CONTEXT")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .tracking(0.7)

                    Text(projection.context.summary)
                        .font(.callout)
                        .foregroundStyle(.secondary)

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

    @ViewBuilder
    private func insideCalibration(_ cue: FeedCue) -> some View {
        let calibration = cueCalibrations[cue.id]
        VStack(alignment: .leading, spacing: 8) {
            Text("Does this resemble the day you actually had?")
                .font(.caption.weight(.semibold))
            HStack(spacing: 8) {
                Button("Close enough") {
                    cueCalibrations[cue.id] = .fits
                }
                .buttonStyle(.bordered)
                .accessibilityValue(calibration == .fits ? "Selected" : "Not selected")

                Button("Not quite") {
                    cueCalibrations[cue.id] = .doesNotFit
                }
                .buttonStyle(.bordered)
                .accessibilityValue(calibration == .doesNotFit ? "Selected" : "Not selected")
            }
            if let calibration {
                Text(calibration == .fits
                    ? "Accepted for this check-in only. It was not added to your living context."
                    : "Set aside for this check-in only. No correction was saved.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("This calibration is session-only until the owner context gateway is connected.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 12)
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
                        value: readinessLabel(projection.outsideReadiness, outside: true),
                        systemImage: projection.outsideReadiness == .ready ? "checkmark.circle" : "testtube.2"
                    )
                    ConversationReadinessRow(
                        title: "Your lived day",
                        value: readinessLabel(projection.livedReadiness, outside: false),
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

    private func readinessLabel(_ readiness: DailyConversationReadiness, outside: Bool) -> String {
        switch readiness {
        case .ready: outside ? "Fresh cue" : "Confirmed"
        case .cueOnly: "Recall cue only"
        case .sampleOnly: "Sample only"
        case .notConnected: outside ? "Not current" : "Not captured"
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

private enum CueCalibration {
    case fits
    case doesNotFit
}

private struct FeedCueCard: View {
    let cue: FeedCue

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Label(
                    cue.boundary == .insideRecall ? "Recall prompt" : "Fresh observation",
                    systemImage: cue.boundary == .insideRecall ? "questionmark.bubble" : "globe"
                )
                .font(.caption.weight(.medium))
                .foregroundStyle(cue.boundary == .insideRecall ? Color.orange : Color.blue)

                Spacer(minLength: 8)

                Text("Expires \(cue.expiresAt, style: .relative)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Text(cue.minimizedCue)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)

            if !cue.sourceDoors.isEmpty {
                HStack(spacing: 10) {
                    ForEach(Array(cue.sourceDoors.enumerated()), id: \.offset) { index, url in
                        Link(index == 0 ? "Open source" : "Source \(index + 1)", destination: url)
                            .font(.caption.weight(.medium))
                    }
                }
            }

            Text(cue.boundary == .insideRecall
                ? "Uncertain · requires your calibration · never a factual claim"
                : "Observed · short-lived · not yet durable evidence")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .stroke(Color(nsColor: .separatorColor).opacity(0.6), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("quiet-desk.conversation.cue.\(cue.id)")
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
