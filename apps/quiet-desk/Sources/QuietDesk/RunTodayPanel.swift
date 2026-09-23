import QuietDeskCore
import SwiftUI

/// The top of Today once a workspace exists: where the day stands, and the
/// one button that runs it through the chosen provider. Approval for the
/// website is a separate button with its own confirmation.
@MainActor
struct RunTodayPanel: View {
    @Bindable var providerStore: ProviderStore
    @Bindable var router: AppRouter
    let mode: DailyConversationMode

    @State private var showApproveSheet = false
    @State private var includeInside = false
    @State private var workspaceInput = "~/Quiet Desk"

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if providerStore.hasWorkspace {
                readiness
                runRow
                if providerStore.isRunning {
                    runningRow
                } else if let result = providerStore.lastRun {
                    resultRow(result)
                } else if let latest = providerStore.status?.latestRun, providerStore.status?.conversation.exists == true {
                    previousRunRow(latest)
                }
                if let error = providerStore.lastError, !providerStore.isRunning {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                noWorkspace
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.32), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color(nsColor: .separatorColor).opacity(0.55), lineWidth: 1)
        }
        .task(id: providerStore.workspacePath) {
            guard providerStore.hasWorkspace else { return }
            if providerStore.catalog == nil { await providerStore.refreshProviders() }
            await providerStore.refreshStatus()
        }
        .sheet(isPresented: $showApproveSheet) {
            approveSheet
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("quiet-desk.conversation.run-today")
    }

    // MARK: Readiness

    private var readiness: some View {
        let status = providerStore.status
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(status.map { "\($0.weekday) · \($0.date)" } ?? providerStore.todayDate)
                    .font(.headline)
                Spacer()
                if let name = providerStore.workspaceName {
                    Label(name, systemImage: "folder")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            readinessRow(
                title: "Capture",
                systemImage: status?.capture.exists == true ? "person.crop.circle.badge.checkmark" : "person.crop.circle.badge.questionmark",
                value: captureLabel(status)
            ) {
                if let path = status?.capture.path, status?.capture.exists == true {
                    Button("Open") { MacHelpers.open(path: path) }
                } else {
                    Button("Write today's capture") {
                        Task {
                            if let path = await providerStore.createCapture() {
                                MacHelpers.open(path: path)
                            }
                        }
                    }
                }
            }

            readinessRow(
                title: "Sources",
                systemImage: "doc.text.magnifyingglass",
                value: sourcesLabel(status)
            ) {
                Button("Collect now") {
                    Task { await providerStore.collect() }
                }
            }

            readinessRow(
                title: "Provider",
                systemImage: providerStore.preferredProvider?.systemImage ?? "terminal",
                value: providerLabel
            ) {
                Button(providerStore.preferredProvider == nil ? "Choose" : "Change") {
                    router.connectionKind = .providers
                    router.destination = .connections
                }
            }
        }
    }

    private func readinessRow<Action: View>(
        title: String,
        systemImage: String,
        value: String,
        @ViewBuilder action: () -> Action
    ) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: systemImage)
                .frame(width: 18)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(title)
                .font(.callout)
                .frame(width: 64, alignment: .leading)
            Text(value)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            action()
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(providerStore.isBusy)
        }
        .accessibilityElement(children: .combine)
    }

    private func captureLabel(_ status: DayStatus?) -> String {
        guard let capture = status?.capture, capture.exists else { return "No capture yet" }
        return capture.authorHuman == true ? "Capture written · by you" : "Capture present · author not marked human"
    }

    private func sourcesLabel(_ status: DayStatus?) -> String {
        guard let sources = status?.sources else { return "Not checked" }
        let noun = sources.verifiedInWindow == 1 ? "source" : "sources"
        return "\(sources.verifiedInWindow) verified public \(noun) in the last \(sources.windowDays) days"
    }

    private var providerLabel: String {
        guard let provider = providerStore.preferredProvider else { return "No provider chosen" }
        let model = providerStore.preferredModel.map { " · \($0)" } ?? ""
        return "\(provider.label)\(model) · \(provider.availability.label)"
    }

    // MARK: Run

    private var canRun: Bool {
        providerStore.preferredProvider != nil
            && mode != .notChecked
            && !providerStore.isBusy
            && !providerStore.isRunning
    }

    private var runRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                Task { await providerStore.runToday(mode: mode) }
            } label: {
                Label(
                    "Run today's conversation with \(providerStore.preferredProvider?.label ?? "a provider")",
                    systemImage: "play.circle"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!canRun)
            .accessibilityIdentifier("quiet-desk.conversation.run")

            if providerStore.preferredProvider == nil {
                Text("Choose a provider you already use under Agents & Sources › Providers.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if mode == .notChecked {
                Text("Choose how much should come in, below, then run.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("Everything the run produces is held in the workspace. Nothing is sent.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var runningRow: some View {
        HStack(spacing: 12) {
            ProgressView()
                .controlSize(.small)
            TimelineView(.periodic(from: providerStore.runStartedAt ?? Date(), by: 1)) { context in
                Text("\(providerStore.activity ?? "Running") · \(elapsed(until: context.date))")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            Spacer()
            Button("Stop") {
                providerStore.cancelRun()
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .accessibilityElement(children: .combine)
    }

    private func elapsed(until date: Date) -> String {
        let seconds = max(0, Int(date.timeIntervalSince(providerStore.runStartedAt ?? date)))
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    private func resultRow(_ result: RunDayResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: result.status == .completed ? "checkmark.circle.fill" : "exclamationmark.circle")
                    .foregroundStyle(result.status == .completed ? Color.green : Color.orange)
                    .accessibilityHidden(true)
                Text(result.status.label)
                    .font(.headline)
                if let conversation = providerStore.status?.conversation, conversation.exists {
                    Text("· \(conversation.developments) developments · \(conversation.places) \(conversation.places == 1 ? "place" : "places")")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }

            ForEach(result.blockers, id: \.self) { code in
                Text(RunBlocker.explanation(for: code))
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if result.status == .failed, let note = result.notes.first {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            outputButtons
        }
        .accessibilityElement(children: .contain)
    }

    private func previousRunRow(_ run: RunRecordSummary) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "clock")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                Text("Last run \(run.status.label.lowercased()) with \(run.provider)")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                if let conversation = providerStore.status?.conversation {
                    Text("· \(conversation.developments) developments · \(conversation.places) \(conversation.places == 1 ? "place" : "places")")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
            outputButtons
        }
    }

    @ViewBuilder
    private var outputButtons: some View {
        let conversation = providerStore.status?.conversation
        HStack(spacing: 10) {
            if let path = conversation?.path, conversation?.exists == true {
                Button("Open the conversation") { MacHelpers.open(path: path) }
                    .buttonStyle(.bordered)
                Button("Approve for the website…") { showApproveSheet = true }
                    .buttonStyle(.bordered)
                    .disabled(providerStore.isBusy)
                    .accessibilityIdentifier("quiet-desk.conversation.approve")
            }
            if conversation?.publicExported == true {
                Label("Approved for the website", systemImage: "checkmark.seal")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Approve

    private var approveSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Approve today's day for the website")
                .font(.title3.weight(.semibold))

            VStack(alignment: .leading, spacing: 8) {
                Text("This writes a minimized public view of today: the outside developments with their source doors as label and link, the context labels, and the Places with their status. No hashes, no excerpts, no run details.")
                Text("It replaces the day file the website renders:")
                Text(providerStore.siteDayFilePath ?? "(site day file not set)")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
            .font(.callout)
            .fixedSize(horizontal: false, vertical: true)

            Toggle("Include the text of my capture", isOn: $includeInside)
            Text(includeInside
                ? "Your capture text, in your words, will appear on the website."
                : "Your capture text stays in the workspace. The website shows only that a capture was written.")
                .font(.caption)
                .foregroundStyle(.secondary)

            Text("Nothing is published by this step. The site is deployed separately, by you.")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack {
                Spacer()
                Button("Cancel") { showApproveSheet = false }
                    .keyboardShortcut(.cancelAction)
                Button("Approve and export") {
                    showApproveSheet = false
                    Task {
                        await providerStore.approveForSite(includeInside: includeInside, outPath: providerStore.siteDayFilePath)
                    }
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(22)
        .frame(width: 460)
    }

    // MARK: Empty

    private var noWorkspace: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("No workspace folder yet", systemImage: "folder.badge.questionmark")
                .font(.headline)
            Text("The workspace is your private copy of templates/quiet-desk-publishing: captures, sources, places, and runs live there, outside this repository.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            TextField("Workspace path", text: $workspaceInput)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("quiet-desk.workspace.path")
            Button("Use this workspace") { Task { await providerStore.setWorkspace(path: workspaceInput) } }
                .disabled(providerStore.isBusy || workspaceInput.isEmpty)
                .accessibilityIdentifier("quiet-desk.workspace.use")
            if let error = providerStore.lastError { Text(error).foregroundStyle(.red) }
            Button("Choose workspace folder…") {
                if let path = MacHelpers.chooseDirectory(
                    title: "Choose the Quiet Desk workspace",
                    message: "A private folder copied from templates/quiet-desk-publishing."
                ) {
                    Task { await providerStore.setWorkspace(path: path) }
                }
            }
            .buttonStyle(.borderedProminent)
        }
    }
}
