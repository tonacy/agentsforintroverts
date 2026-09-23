import Foundation
import Observation

/// The app's view of the local runner: which providers this Mac already has,
/// where today's day stands, and the few actions that move it forward.
///
/// It never holds a credential. Choosing a provider writes one preference file
/// into the workspace; running hands the work to a harness the person already
/// signed in to; approving is a separate, explicit call.
@MainActor
@Observable
public final class ProviderStore {
    public private(set) var companion: CompanionState?
    public private(set) var recap: CheckInRecap?
    public private(set) var conversationText: String?
    public var conversationMode: DailyConversationMode = .short
    public var publicTopics = "Personal agents, human authorship, and participation in online networks"
    public private(set) var catalog: ProviderCatalog?
    public private(set) var status: DayStatus?
    public private(set) var isBusy = false
    public private(set) var activity: String?
    public private(set) var lastError: String?
    public private(set) var lastRun: RunDayResult?
    public private(set) var lastExport: ExportResult?
    public private(set) var lastCollect: CollectResult?
    public private(set) var runStartedAt: Date?

    public var workspacePath: String? {
        didSet {
            persist(workspacePath, key: Key.workspacePath)
            companion = nil; catalog = nil; status = nil; recap = nil; lastRun = nil; conversationText = nil; lastError = nil; lastCollect = nil
            publicTopics = "Personal agents, human authorship, and participation in online networks"
        }
    }

    public var repoPathOverride: String? {
        didSet { persist(repoPathOverride, key: Key.repoPath) }
    }

    public var nodePathOverride: String? {
        didSet { persist(nodePathOverride, key: Key.nodePath) }
    }

    public var siteDayFileOverride: String? {
        didSet { persist(siteDayFileOverride, key: Key.siteDayFile) }
    }

    private let bridge: any RunnerBridge
    private let defaults: UserDefaults?
    private let environmentProvider: () throws -> RunnerEnvironment
    private let today: @Sendable () -> String
    private var runTask: Task<Void, Never>?
    private var preparationTask: Task<Void, Never>?

    public init(
        bridge: any RunnerBridge,
        defaults: UserDefaults?,
        environmentProvider: (() throws -> RunnerEnvironment)? = nil,
        today: @escaping @Sendable () -> String = ProviderStore.localToday
    ) {
        self.bridge = bridge
        self.defaults = defaults
        self.today = today
        self.workspacePath = defaults?.string(forKey: Key.workspacePath)
        self.repoPathOverride = defaults?.string(forKey: Key.repoPath)
        self.nodePathOverride = defaults?.string(forKey: Key.nodePath)
        self.siteDayFileOverride = defaults?.string(forKey: Key.siteDayFile)

        if let environmentProvider {
            self.environmentProvider = environmentProvider
        } else {
            // Read at call time so a change in Settings applies to the next run.
            self.environmentProvider = { try RunnerLocator.environment(repoOverride: defaults?.string(forKey: Key.repoPath), nodeOverride: defaults?.string(forKey: Key.nodePath)) }
        }
    }

    public static let localToday: @Sendable () -> String = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    // MARK: Derived

    public var todayDate: String { today() }

    public var workspaceName: String? {
        guard let workspacePath else { return nil }
        return URL(fileURLWithPath: workspacePath).lastPathComponent
    }

    public var hasWorkspace: Bool {
        guard let workspacePath else { return false }
        return ["context", "preferences"].allSatisfy { folder in
            var directory: ObjCBool = false
            return FileManager.default.fileExists(atPath: URL(fileURLWithPath: workspacePath).appendingPathComponent(folder).path, isDirectory: &directory) && directory.boolValue
        }
    }

    public var preferredProvider: ProviderDescriptor? {
        if let catalog, let preferred = catalog.preferredProvider { return preferred }
        if let preference = status?.providerPreference {
            return catalog?.provider(id: preference.provider)
        }
        return nil
    }

    public var preferredModel: String? {
        status?.providerPreference?.model
    }

    /// The environment, resolved fresh so Settings overrides apply.
    public func resolvedEnvironment() -> RunnerEnvironment? {
        try? currentEnvironment()
    }

    public var siteDayFilePath: String? {
        if let siteDayFileOverride, !siteDayFileOverride.isEmpty { return siteDayFileOverride }
        return resolvedEnvironment()?.defaultSiteDayFile.path
    }

    public var isRunning: Bool { runTask != nil }

    // MARK: Actions

    public func setWorkspace(path: String) async {
        guard !isBusy else { return }
        let expanded = NSString(string: path.trimmingCharacters(in: .whitespacesAndNewlines)).expandingTildeInPath
        var directory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: expanded, isDirectory: &directory), directory.boolValue,
              FileManager.default.fileExists(atPath: URL(fileURLWithPath: expanded).appendingPathComponent("context").path),
              FileManager.default.fileExists(atPath: URL(fileURLWithPath: expanded).appendingPathComponent("preferences").path) else {
            lastError = "Choose an existing Quiet Desk workspace containing context and preferences folders."
            return
        }
        workspacePath = URL(fileURLWithPath: expanded).standardizedFileURL.path
        await refreshProviders()
        await refreshStatus()
        await loadRecap()
        await refreshCompanion()
    }

    private func payload(_ value: [String: String]) throws -> String {
        String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
    }

    public func refreshCompanion() async {
        guard let workspacePath, hasWorkspace else { return }
        await perform(nil) {
            let output = try await self.bridge.run(.companion("status", workspace: workspacePath), in: try self.currentEnvironment())
            guard self.workspacePath == workspacePath else { return }
            self.companion = try Self.decode(CompanionState.self, output)
        }
    }

    public func prepareCodexConversation() async -> URL? {
        guard let workspacePath, hasWorkspace, !isBusy else { return nil }
        var result: URL?
        await perform("Opening your Codex conversation") {
            let output = try await self.bridge.run(.companion("open", workspace: workspacePath), in: try self.currentEnvironment())
            guard self.workspacePath == workspacePath else { return }
            let state = try Self.decode(CompanionState.self, output)
            self.companion = state
            if let value = state.url, let url = URL(string: value), url.scheme == "codex" {
                result = url
            } else { throw RunnerError.decoding("Codex did not return a conversation link.") }
        }
        return result
    }

    /// Set one piece in the house style, beside any hand-built page.
    public func renderPiece(folder: String, output: String? = nil) async {
        guard let workspacePath else { return }
        await perform("Setting the piece in the house style") {
            _ = try await self.bridge.run(.renderPiece(workspace: workspacePath, folder: folder, output: output), in: try self.currentEnvironment())
        }
    }

    public func loadRecap() async {
        guard let workspacePath else { return }
        await perform(nil) {
            let out = try await self.bridge.run(.checkIn("read", workspace: workspacePath, date: self.today()), in: try self.currentEnvironment())
            self.recap = try Self.decode(CheckInRecap?.self, out)
        }
    }

    public func prepareRecap(context: String, useHistory: Bool) async {
        guard let workspacePath, !isBusy else { return }
        await performCancellable("Codex is preparing your recap") {
            let data = try JSONSerialization.data(withJSONObject: ["context": context, "useHistory": useHistory])
            let command = RunnerCommand.checkIn("prepare", workspace: workspacePath, date: self.today(), input: String(decoding: data, as: UTF8.self))
            self.recap = try Self.decode(CheckInRecap.self, await self.bridge.run(command, in: try self.currentEnvironment()))
        }
    }

    public func saveReflection(_ reflection: String) async {
        guard let workspacePath, let recap, !isBusy else { return }
        await perform("Saving your reflection") {
            let input = try self.payload(["revision": recap.revision, "reflection": reflection])
            _ = try await self.bridge.run(.checkIn("calibrate", workspace: workspacePath, date: self.today(), input: input), in: try self.currentEnvironment())
        }
        if lastError == nil { await refreshStatus() }
    }

    public func researchAndRun(mode: DailyConversationMode) async {
        guard let workspacePath, !isBusy else { return }
        if mode == .noNewInput { await runToday(mode: mode); return }
        await performCancellable("Codex is researching public sources") {
            let input = try self.payload(["topics": self.publicTopics])
            let output = try await self.bridge.run(.research(workspace: workspacePath, date: self.today(), input: input), in: try self.currentEnvironment())
            self.lastCollect = try Self.decode(CollectResult.self, output)
            guard let collected = self.lastCollect, collected.written >= 2 else {
                throw RunnerError.decoding("Fewer than two public sources could be verified. Try different public topics. " + (self.lastCollect?.errors.map(\.message).joined(separator: "; ") ?? ""))
            }
        }
        guard lastError == nil else { return }
        await runToday(mode: mode)
    }

    public func refreshProviders() async {
        await perform("Checking providers") {
            let output = try await self.bridge.run(.listProviders(workspace: self.workspacePath), in: try self.currentEnvironment())
            self.catalog = try Self.decode(ProviderCatalog.self, output)
        }
    }

    public func choose(provider: String, model: String?) async {
        guard let workspacePath else {
            lastError = RunnerError.workspaceNotSet.localizedDescription
            return
        }
        await perform("Choosing \(provider)") {
            let environment = try self.currentEnvironment()
            _ = try await self.bridge.run(.useProvider(workspace: workspacePath, provider: provider, model: model), in: environment)
            let output = try await self.bridge.run(.listProviders(workspace: workspacePath), in: environment)
            self.catalog = try Self.decode(ProviderCatalog.self, output)
        }
    }

    public func refreshStatus(for date: String? = nil) async {
        guard let workspacePath else {
            status = nil
            return
        }
        await perform(nil) {
            let output = try await self.bridge.run(.status(workspace: workspacePath, date: date ?? self.today()), in: try self.currentEnvironment())
            self.status = try Self.decode(DayStatus.self, output)
            if let topics = self.status?.publicTopics { self.publicTopics = topics }
            if let path = self.status?.conversation.path, self.status?.conversation.exists == true {
                self.conversationText = try? String(contentsOfFile: path, encoding: .utf8)
            } else { self.conversationText = nil }
        }
    }

    @discardableResult
    public func createCapture() async -> String? {
        guard let workspacePath else {
            lastError = RunnerError.workspaceNotSet.localizedDescription
            return nil
        }
        var path: String?
        await perform("Preparing today's capture") {
            let output = try await self.bridge.run(.newCapture(workspace: workspacePath, date: self.today()), in: try self.currentEnvironment())
            path = try Self.decode(CaptureResult.self, output).path
        }
        await refreshStatus()
        return path
    }

    public func collect() async {
        guard let workspacePath else {
            lastError = RunnerError.workspaceNotSet.localizedDescription
            return
        }
        await perform("Collecting public sources") {
            let output = try await self.bridge.run(.collect(workspace: workspacePath), in: try self.currentEnvironment())
            self.lastCollect = try Self.decode(CollectResult.self, output)
        }
        await refreshStatus()
    }

    public func runToday(mode: DailyConversationMode) async {
        guard let workspacePath else {
            lastError = RunnerError.workspaceNotSet.localizedDescription
            return
        }
        let provider = preferredProvider?.id ?? status?.providerPreference?.provider
        let model = preferredModel
        let providerLabel = preferredProvider?.label ?? provider ?? "the chosen provider"

        lastRun = nil
        runStartedAt = Date()
        let task = Task { @MainActor in
            await self.perform("Running today's conversation with \(providerLabel)") {
                let command = RunnerCommand.runDay(workspace: workspacePath, date: self.today(), provider: provider, model: model, mode: mode)
                let output = try await self.bridge.run(command, in: try self.currentEnvironment())
                self.lastRun = try Self.decode(RunDayResult.self, output)
            }
        }
        runTask = task
        await task.value
        runTask = nil
        runStartedAt = nil
        await refreshStatus()
    }

    public func cancelRun() {
        runTask?.cancel()
        preparationTask?.cancel()
    }

    /// The approval gate. Calling this is the approval; the flag is always sent.
    public func approveForSite(includeInside: Bool, outPath: String?) async {
        guard let workspacePath else {
            lastError = RunnerError.workspaceNotSet.localizedDescription
            return
        }
        await perform("Exporting the public day") {
            let command = RunnerCommand.exportPublic(workspace: workspacePath, date: self.today(), includeInside: includeInside, out: outPath)
            let output = try await self.bridge.run(command, in: try self.currentEnvironment())
            self.lastExport = try Self.decode(ExportResult.self, output)
        }
        await refreshStatus()
    }

    public func clearError() {
        lastError = nil
    }

    // MARK: Plumbing

    private func currentEnvironment() throws -> RunnerEnvironment {
        try environmentProvider()
    }

    private func performCancellable(_ label: String, _ work: @escaping @MainActor () async throws -> Void) async {
        let task = Task { await self.perform(label, work) }
        preparationTask = task
        await task.value
        preparationTask = nil
    }

    private func perform(_ label: String?, _ work: @MainActor () async throws -> Void) async {
        guard !isBusy else { return }
        isBusy = true
        activity = label
        lastError = nil
        defer {
            isBusy = false
            activity = nil
        }
        do {
            try await work()
        } catch is CancellationError {
            lastError = RunnerError.cancelled.localizedDescription
        } catch {
            lastError = error.localizedDescription
        }
    }

    private static func decode<T: Decodable>(_ type: T.Type, _ output: RunnerOutput) throws -> T {
        do {
            return try RunnerJSON.decode(type, from: output.stdout)
        } catch {
            let preview = String(decoding: output.stdout.prefix(200), as: UTF8.self)
            throw RunnerError.decoding(preview.isEmpty ? error.localizedDescription : preview)
        }
    }

    private func persist(_ value: String?, key: String) {
        if let value, !value.isEmpty {
            defaults?.set(value, forKey: key)
        } else {
            defaults?.removeObject(forKey: key)
        }
    }

    private enum Key {
        static let workspacePath = "quietDesk.workspacePath"
        static let repoPath = "quietDesk.repoPath"
        static let nodePath = "quietDesk.nodePath"
        static let siteDayFile = "quietDesk.siteDayFile"
    }
}
