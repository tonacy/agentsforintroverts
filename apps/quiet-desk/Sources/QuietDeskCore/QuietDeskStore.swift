import Foundation
import Observation

public enum StoreLoadState: Equatable, Sendable {
    case idle
    case loading
    case loaded(Date)
    case empty
    case failed(String)
}

public enum ApprovalError: LocalizedError, Equatable {
    case itemNotFound
    case noProposedAction
    case readOnlyMode
    case actionNotApprovalGated
    case missingProposalEvidence
    case alreadyApproved

    public var errorDescription: String? {
        switch self {
        case .itemNotFound:
            "The selected feed item no longer exists."
        case .noProposedAction:
            "This item does not contain a proposed external action."
        case .readOnlyMode:
            "Read-only mode is on. No action was approved."
        case .actionNotApprovalGated:
            "Quiet Desk refuses external actions without an explicit approval gate."
        case .missingProposalEvidence:
            "This action has no independent proposal evidence to approve."
        case .alreadyApproved:
            "This exact action revision is already approved."
        }
    }
}

@MainActor
@Observable
public final class QuietDeskStore {
    public private(set) var snapshot: QuietDeskSnapshot
    public private(set) var loadState: StoreLoadState
    public private(set) var approvalReceipts: [ApprovalReceipt] = []
    public private(set) var lastNotice: String?

    public var hubBaseURLString: String {
        didSet { persist(hubBaseURLString, key: PreferenceKey.hubBaseURL) }
    }

    public var readOnlyMode: Bool {
        didSet { persist(readOnlyMode, key: PreferenceKey.readOnlyMode) }
    }

    public var menuBarEnabled: Bool {
        didSet { persist(menuBarEnabled, key: PreferenceKey.menuBarEnabled) }
    }

    private let client: QuietDeskClient
    private let defaults: UserDefaults?
    private let now: @Sendable () -> Date

    public init(
        client: QuietDeskClient,
        initialSnapshot: QuietDeskSnapshot = .emptySynthetic(),
        initialLoadState: StoreLoadState = .idle,
        defaults: UserDefaults? = nil,
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.client = client
        self.snapshot = initialSnapshot
        self.loadState = initialLoadState
        self.defaults = defaults
        self.now = now
        self.hubBaseURLString = defaults?.string(forKey: PreferenceKey.hubBaseURL)
            ?? "https://hub.example.invalid"
        self.readOnlyMode = defaults?.object(forKey: PreferenceKey.readOnlyMode) as? Bool ?? true
        self.menuBarEnabled = defaults?.object(forKey: PreferenceKey.menuBarEnabled) as? Bool ?? true
    }

    public var hubBaseURL: URL? {
        guard let components = URLComponents(string: hubBaseURLString),
              let scheme = components.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              components.host != nil
        else { return nil }
        return components.url
    }

    public var hubURLValidationMessage: String? {
        hubBaseURL == nil ? "Enter a complete HTTP or HTTPS hub URL." : nil
    }

    public var pendingApprovalCount: Int {
        snapshot.items.filter {
            $0.proofLedger.contains(.proposed)
                && !$0.proofLedger.contains(.approved)
                && $0.action != nil
        }.count
    }

    public var visibleThreadCount: Int {
        snapshot.topLevelThreads().count
    }

    public var pendingHandoffCount: Int {
        snapshot.threads.filter { thread in
            guard let handoffID = thread.handoffFeedItemID,
                  let handoff = item(id: handoffID)
            else { return false }
            return handoff.proofLedger.contains(.proposed)
                && !handoff.proofLedger.contains(.approved)
                && handoff.action != nil
        }.count
    }

    public var handledCount: Int {
        snapshot.items.filter { $0.status == .handled }.count
    }

    public var watchingCount: Int {
        snapshot.items.filter { $0.status == .watching }.count
    }

    public var syncDescription: String {
        switch loadState {
        case .idle: "Not loaded"
        case .loading: "Loading synthetic fixtures"
        case .loaded(let date): "Fixtures loaded \(date.formatted(date: .omitted, time: .shortened))"
        case .empty: "Synthetic fixtures are empty"
        case .failed: "Fixture load failed"
        }
    }

    public func loadIfNeeded() async {
        guard loadState == .idle else { return }
        await reload()
    }

    public func reload() async {
        loadState = .loading
        lastNotice = nil

        do {
            let loaded = try await client.loadSnapshot(hubBaseURL)
            guard !Task.isCancelled else { return }
            snapshot = loaded
            loadState = loaded.items.isEmpty ? .empty : .loaded(now())
        } catch is CancellationError {
            return
        } catch {
            loadState = .failed(error.localizedDescription)
        }
    }

    public func items(for filter: FeedFilter, query: String = "") -> [FeedItem] {
        snapshot.filteredItems(for: filter, query: query)
    }

    public func item(id: UUID?) -> FeedItem? {
        guard let id else { return nil }
        return snapshot.items.first { $0.id == id }
    }

    public func thread(id: UUID?) -> CommonGroundThread? {
        guard let id else { return nil }
        return snapshot.thread(id: id)
    }

    public func handoffItem(for threadID: UUID?) -> FeedItem? {
        guard let thread = thread(id: threadID),
              let handoffID = thread.handoffFeedItemID
        else { return nil }
        return item(id: handoffID)
    }

    public func contextStatements(for threadID: UUID?) -> [ContextStatement] {
        guard let thread = thread(id: threadID) else { return [] }
        return thread.contextStatementIDs.compactMap { snapshot.contextStatement(id: $0) }
    }

    public func agent(id: UUID?) -> AgentProfile? {
        guard let id else { return nil }
        return snapshot.agent(id: id)
    }

    public func source(id: UUID?) -> SourceProfile? {
        guard let id else { return nil }
        return snapshot.source(id: id)
    }

    public func latestApprovalReceipt(for itemID: UUID) -> ApprovalReceipt? {
        approvalReceipts.last { $0.itemID == itemID }
    }

    public func canApprove(itemID: UUID?) -> Bool {
        guard !readOnlyMode,
              let item = item(id: itemID),
              item.proofLedger.contains(.proposed),
              !item.proofLedger.contains(.approved),
              let action = item.action
        else { return false }
        return action.kind.isExternal && action.requiresExplicitApproval
    }

    @discardableResult
    public func approveAction(for itemID: UUID) throws -> ApprovalReceipt {
        guard let index = snapshot.items.firstIndex(where: { $0.id == itemID }) else {
            throw ApprovalError.itemNotFound
        }
        guard !readOnlyMode else {
            throw ApprovalError.readOnlyMode
        }
        guard let action = snapshot.items[index].action else {
            throw ApprovalError.noProposedAction
        }
        guard action.kind.isExternal && action.requiresExplicitApproval else {
            throw ApprovalError.actionNotApprovalGated
        }
        guard !snapshot.items[index].proofLedger.contains(.approved) else {
            throw ApprovalError.alreadyApproved
        }
        guard snapshot.items[index].proofLedger.contains(.proposed) else {
            throw ApprovalError.missingProposalEvidence
        }

        snapshot.items[index].proofLedger.record(.approved)
        snapshot.items[index].run.state = .waitingForHub
        snapshot.items[index].run.summary = "Approved locally. Waiting for a hub; no provider request was made."
        snapshot.items[index].run.lastUpdatedAt = now()

        let receipt = ApprovalReceipt(
            id: UUID(),
            itemID: itemID,
            actionID: action.id,
            actionRevision: action.revision,
            approvedAt: now(),
            payloadSHA256: action.payloadSHA256,
            recordedEvidence: .approved,
            note: "Local approval only. No provider request was made and no delivery is claimed."
        )
        approvalReceipts.append(receipt)
        lastNotice = receipt.note
        return receipt
    }

    public func clearNotice() {
        lastNotice = nil
    }

    private func persist(_ value: Any, key: String) {
        defaults?.set(value, forKey: key)
    }

    private enum PreferenceKey {
        static let hubBaseURL = "quietDesk.hubBaseURL"
        static let readOnlyMode = "quietDesk.readOnlyMode"
        static let menuBarEnabled = "quietDesk.menuBarEnabled"
    }
}
