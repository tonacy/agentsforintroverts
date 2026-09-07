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
        didSet { persist(workspacePath, key: Key.workspacePath) }
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

    public var hasWorkspace: Bool { workspacePath != nil }

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

    private func perform(_ label: String?, _ work: @MainActor () async throws -> Void) async {
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
