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
    public private(set) var feedConnectionPlans: [FeedConnectionPlan]
    public private(set) var feedPlanDocument: FeedPlanDocument?
    public private(set) var feedConnectionReceipts: [FeedConnectionReceipt]
    public private(set) var feedCues: [FeedCue]

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
    private let feedStateRepository: FeedStateRepository?

    public init(
        client: QuietDeskClient,
        initialSnapshot: QuietDeskSnapshot = .emptySynthetic(),
        initialLoadState: StoreLoadState = .idle,
        defaults: UserDefaults? = nil,
        feedStateRepository: FeedStateRepository? = nil,
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.client = client
        self.snapshot = initialSnapshot
        self.loadState = initialLoadState
        self.defaults = defaults
        self.now = now
        self.feedStateRepository = feedStateRepository
        let preferencePlans = Self.loadFeedConnectionPlans(from: defaults)
        let loadedDocument: FeedPlanDocument? = if let feedStateRepository {
            try? feedStateRepository.loadPlan()
        } else {
            nil
        }
        let sharedDocument: FeedPlanDocument?
        if let loadedDocument {
            sharedDocument = loadedDocument
        } else if let feedStateRepository,
                  preferencePlans.contains(where: \.isEnabled) {
            sharedDocument = try? feedStateRepository.savePlan(
                preferencePlans,
                previous: nil,
                now: now()
            )
        } else {
            sharedDocument = nil
        }
        self.feedConnectionPlans = FeedConnectionPlan.normalized(sharedDocument?.plans ?? preferencePlans)
        self.feedPlanDocument = sharedDocument
        self.feedConnectionReceipts = if let feedStateRepository {
            (try? feedStateRepository.loadReceipts()) ?? []
        } else {
            []
        }
        self.feedCues = if let feedStateRepository {
            (try? feedStateRepository.loadCues(now: now())) ?? []
        } else {
            []
        }
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

    public var requestedFeedCount: Int {
        feedConnectionPlans.filter(\.isEnabled).count
    }

    public var feedsReadyToAuthorizeCount: Int {
        feedConnectionPlans.filter(\.isReadyToAuthorize).count
    }

    public var hasInvalidFeedPlans: Bool {
        feedConnectionPlans.contains { $0.validationMessage != nil }
    }

    public var verifiedFeedCount: Int {
        feedConnectionPlans.filter { feedConnectionPhase(for: $0.id).isVerified }.count
    }

    public var activeOutsideCueCount: Int {
        feedCues.filter { $0.boundary == .outsideInput && $0.isActive(at: now()) }.count
    }

    public var activeInsideCueCount: Int {
        feedCues.filter { $0.boundary == .insideRecall && $0.isActive(at: now()) }.count
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

    public func feedConnectionPhase(for id: FeedConnectionID) -> FeedConnectionPhase {
        guard let plan = feedConnectionPlans.first(where: { $0.id == id }), plan.isEnabled else {
            return .notRequested
        }
        guard let document = feedPlanDocument else {
            return .awaitingVerification
        }

        let matching = feedConnectionReceipts
            .filter {
                $0.feedID == id
                    && $0.planRevision == document.revision
                    && $0.planHash == document.planHash
            }
            .max { $0.verifiedAt < $1.verifiedAt }

        guard let receipt = matching else { return .awaitingVerification }
        if let validation = receipt.validationMessage(plan: plan, document: document, now: now()) {
            return .partial(validation)
        }
        switch receipt.status {
        case .verified where receipt.allChecksPassed:
            return receipt.expiresAt > now()
                ? .verified(until: receipt.expiresAt)
                : .stale(lastVerifiedAt: receipt.verifiedAt)
        case .verified:
            return .partial("The receipt did not pass every required check.")
        case .partial:
            return .partial(receipt.summary)
        case .unavailable:
            return .unavailable(receipt.summary)
        }
    }

    public func refreshFeedConnectionReceipts() {
        guard let feedStateRepository else { return }
        do {
            feedConnectionReceipts = try feedStateRepository.loadReceipts()
            feedCues = try feedStateRepository.loadCues(now: now())
            lastNotice = "Feed receipts and short-lived cues refreshed."
        } catch {
            lastNotice = "Couldn’t refresh feed state: \(error.localizedDescription)"
        }
    }

    public func refreshFeedStateSilently() {
        guard let feedStateRepository else { return }
        feedConnectionReceipts = (try? feedStateRepository.loadReceipts()) ?? feedConnectionReceipts
        feedCues = (try? feedStateRepository.loadCues(now: now())) ?? feedCues
    }

    public func dailyConversationProjection(for mode: DailyConversationMode) -> DailyConversationProjection {
        snapshot.dailyConversationProjection(for: mode, feedCues: feedCues, now: now())
    }

    public func verifyComputerHistory(roots: [URL]? = nil) {
        guard let feedStateRepository, let feedPlanDocument else {
            lastNotice = FeedRuntimeError.sharedStateUnavailable.localizedDescription
            return
        }
        do {
            let receipt = try ComputerHistoryFeedAdapter.verify(
                planDocument: feedPlanDocument,
                roots: roots ?? ComputerHistoryFeedAdapter.defaultRootCandidates(),
                now: now()
            )
            try feedStateRepository.appendReceipt(receipt)
            feedConnectionReceipts.append(receipt)
            feedCues = (try? feedStateRepository.loadCues(now: now())) ?? feedCues
            lastNotice = receipt.summary
        } catch {
            lastNotice = "Computer History verification failed: \(error.localizedDescription)"
        }
    }

    /// Saves a permission plan only. This does not request system access,
    /// authenticate an account, start an adapter, or publish anything.
    public func replaceFeedConnectionPlans(_ plans: [FeedConnectionPlan]) {
        let normalized = FeedConnectionPlan.normalized(plans)
        feedConnectionPlans = normalized
        if let data = try? JSONEncoder().encode(normalized) {
            defaults?.set(data, forKey: PreferenceKey.feedConnectionPlans)
        }
        if let feedStateRepository {
            do {
                feedPlanDocument = try feedStateRepository.savePlan(
                    normalized,
                    previous: feedPlanDocument,
                    now: now()
                )
                feedConnectionReceipts = try feedStateRepository.loadReceipts()
                feedCues = try feedStateRepository.loadCues(now: now())
                lastNotice = normalized.contains(where: \.isEnabled)
                    ? "Feed plan saved for this Mac and its agents. Selected feeds still need verification."
                    : "Feed plan saved with every feed off."
                return
            } catch {
                lastNotice = "Feed plan stayed in this app, but agent sharing failed: \(error.localizedDescription)"
                return
            }
        }

        lastNotice = normalized.contains(where: \.isEnabled)
            ? "Feed plan saved locally. No account was connected."
            : "Feed plan saved with every feed off. No account was connected."
    }

    private func persist(_ value: Any, key: String) {
        defaults?.set(value, forKey: key)
    }

    private static func loadFeedConnectionPlans(from defaults: UserDefaults?) -> [FeedConnectionPlan] {
        guard let data = defaults?.data(forKey: PreferenceKey.feedConnectionPlans),
              let decoded = try? JSONDecoder().decode([FeedConnectionPlan].self, from: data)
        else { return FeedConnectionPlan.defaults }
        return FeedConnectionPlan.normalized(decoded)
    }

    private enum PreferenceKey {
        static let hubBaseURL = "quietDesk.hubBaseURL"
        static let readOnlyMode = "quietDesk.readOnlyMode"
        static let menuBarEnabled = "quietDesk.menuBarEnabled"
        static let feedConnectionPlans = "quietDesk.feedConnectionPlans.v1"
    }
}
