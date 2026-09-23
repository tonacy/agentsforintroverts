import QuietDeskCore
import SwiftUI

@MainActor
struct CodexCheckInView: View {
    @Bindable var providerStore: ProviderStore
    @Bindable var router: AppRouter
    @State private var context = ""
    @State private var useHistory = true
    @State private var reflection = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Start with your day.").font(.largeTitle.weight(.semibold))
            Text("Codex helps you remember. You decide what mattered.")
                .foregroundStyle(.secondary)
            HStack {
                Label(providerStore.workspaceName ?? "Quiet Desk", systemImage: "folder")
                Spacer()
                Text(providerStore.preferredProvider?.label ?? "Choose a provider")
                Button("Provider settings") {
                    router.connectionKind = .providers; router.destination = .connections
                }
            }.font(.caption)

            Button("No new input today") { Task { await providerStore.runToday(mode: .noNewInput) } }
                .disabled(providerStore.isBusy)

            if providerStore.status?.capture.exists != true {
                GroupBox("1. Recall") {
                    VStack(alignment: .leading, spacing: 12) {
                        Toggle("Use Computer History for today", isOn: $useHistory)
                        Text("Uses the activity already available to Codex. Recording settings stay as you set them.")
                            .font(.caption).foregroundStyle(.secondary)
                        Text("Other context (optional)").font(.headline)
                        TextEditor(text: $context).frame(minHeight: 80)
                            .accessibilityLabel("Context for today's recap")
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(.quaternary))
                        Text("Paste a note, an excerpt, or context from another conversation.")
                            .font(.caption).foregroundStyle(.secondary)
                        Button(providerStore.recap == nil ? "Ask Codex what I did today" : "Prepare a new recap") {
                            Task { await providerStore.prepareRecap(context: context, useHistory: useHistory) }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(providerStore.isBusy || (!useHistory && context.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                        .accessibilityIdentifier("quiet-desk.check-in.prepare")
                    }.padding(8)
                }
            }

            if let recap = providerStore.recap {
                GroupBox("2. What mattered?") {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Codex's recap · observed and inferred, in its words").font(.caption).foregroundStyle(.secondary)
                        Text(recap.recap).textSelection(.enabled)
                        Text(recap.coverage).font(.callout).foregroundStyle(.secondary)
                        DisclosureGroup("Evidence references") {
                            ForEach(Array(recap.evidence.enumerated()), id: \.offset) { _, item in
                                Text(item).font(.caption).textSelection(.enabled)
                            }
                        }
                        if providerStore.status?.capture.exists != true {
                            Text(recap.question).font(.headline)
                            TextEditor(text: $reflection).frame(minHeight: 100)
                                .accessibilityLabel("Your corrections and what mattered")
                                .overlay(RoundedRectangle(cornerRadius: 4).stroke(.quaternary))
                            Button("Save my reflection") { Task { await providerStore.saveReflection(reflection) } }
                                .disabled(providerStore.isBusy || reflection.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                                .accessibilityIdentifier("quiet-desk.check-in.save")
                        }
                    }.padding(8)
                }
            }

            if providerStore.status?.capture.exists == true {
                HStack {
                    Label("Your reflection is saved", systemImage: "checkmark.circle")
                    if let path = providerStore.status?.capture.path {
                        Button("Read or edit") { MacHelpers.open(path: path) }
                    }
                }
                GroupBox("3. Bring in the outside world") {
                    VStack(alignment: .leading, spacing: 12) {
                        TextField("Public topics to research", text: $providerStore.publicTopics, axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("quiet-desk.check-in.topics")
                        Text("Only these public topics go to outside research. Your recap and reflection stay out of its searches. Sources are checked again before use; recently checked does not mean recently published.")
                            .font(.caption).foregroundStyle(.secondary)
                        Picker("How much should come in?", selection: $providerStore.conversationMode) {
                            Text("Short").tag(DailyConversationMode.short)
                            Text("Deeper").tag(DailyConversationMode.deep)
                            Text("No new input").tag(DailyConversationMode.noNewInput)
                        }.pickerStyle(.segmented)
                        Button(providerStore.conversationMode == .noNewInput ? "Keep today quiet" : "Research and start today's conversation") {
                            Task { await providerStore.researchAndRun(mode: providerStore.conversationMode) }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(providerStore.isBusy || providerStore.preferredProvider == nil)
                        .accessibilityIdentifier("quiet-desk.check-in.run")
                    }.padding(8)
                }
            }

            if providerStore.isBusy {
                HStack { ProgressView().controlSize(.small); Text(providerStore.activity ?? "Working…"); Button("Stop") { providerStore.cancelRun() } }
            }
            if let error = providerStore.lastError {
                Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.red)
                    .textSelection(.enabled).accessibilityIdentifier("quiet-desk.check-in.error")
            }
            if let sources = providerStore.lastCollect {
                Text("\(sources.written) sources verified · \(sources.errors.count) unavailable")
                    .font(.caption).foregroundStyle(.secondary)
                if !sources.errors.isEmpty {
                    DisclosureGroup("Unavailable sources") {
                        ForEach(Array(sources.errors.enumerated()), id: \.offset) { _, failure in
                            Text("\(failure.url): \(failure.message)").font(.caption).textSelection(.enabled)
                        }
                    }
                }
            }
            if let run = providerStore.lastRun {
                Text("\(run.status.label) · \(run.blockers.map { RunBlocker.explanation(for: $0) }.joined(separator: " "))")
                if run.status != .completed, let note = run.notes.first { Text(note).font(.callout).textSelection(.enabled) }
            }
            if let conversation = providerStore.conversationText {
                Divider()
                Text("Today's conversation").font(.title2)
                Text(conversation).textSelection(.enabled)
                    .accessibilityIdentifier("quiet-desk.check-in.conversation")
                DisclosureGroup("Manual controls and website export") {
                    RunTodayPanel(providerStore: providerStore, router: router, mode: providerStore.conversationMode)
                }
            }
            Text("Everything produced here is held for you. Nothing is published or sent to anyone.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .onChange(of: providerStore.recap?.revision) { reflection = "" }
        .task(id: providerStore.workspacePath) {
            await providerStore.refreshProviders()
            await providerStore.refreshStatus()
            await providerStore.loadRecap()
        }
    }
}
