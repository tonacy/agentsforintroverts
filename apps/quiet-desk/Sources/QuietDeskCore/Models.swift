import CryptoKit
import Foundation

/// The deliberately small, user-facing information architecture.
///
/// Operational states such as handled and watching are activity filters, not
/// competing top-level destinations. Agents and sources share Connections.
public enum QuietDeskDestination: String, CaseIterable, Identifiable, Sendable {
    case conversation
    case activity
    case connections

    public var id: Self { self }

    public static let initial: QuietDeskDestination = .conversation

    public var title: String {
        switch self {
        case .conversation: "Today"
        case .activity: "Activity"
        case .connections: "Agents & Sources"
        }
    }
}

/// A one-check-in calibration, never a durable preference by itself.
///
/// Raw values match the harness-neutral Context Kernel contract. The UI can use
/// friendlier labels without teaching an adapter a second vocabulary.
public enum DailyConversationMode: String, CaseIterable, Codable, Hashable, Identifiable, Sendable {
    case notChecked = "not_checked"
    case short
    case deep
    case noNewInput = "no_new_input"

    public var id: Self { self }

    public static let choices: [DailyConversationMode] = [.short, .deep, .noNewInput]

    public var title: String {
        switch self {
        case .notChecked: "Not chosen"
        case .short: "Short version"
        case .deep: "Deeper look"
        case .noNewInput: "No new input"
        }
    }

    public var explanation: String {
        switch self {
        case .notChecked:
            "Choose how much outside context should enter this check-in."
        case .short:
            "One compact outside update and at most one recurring conversation."
        case .deep:
            "A bounded look at up to three recurring conversations and the context behind them."
        case .noNewInput:
            "Bring in nothing new and keep only something that was already urgent."
        }
    }
}

public enum DailyConversationReadiness: String, Codable, Hashable, Sendable {
    case ready
    case sampleOnly
    case notConnected
}

/// The Mac app's deliberately bounded read projection for one daily check-in.
///
/// Supporting threads are not Places. A Place requires a current source door,
/// a confirmed human capture, a contribution, and a human-cost estimate. Until
/// both sides of the conversation are connected, this projection stops early.
public struct DailyConversationProjection: Hashable, Sendable {
    public let mode: DailyConversationMode
    public let outsideReadiness: DailyConversationReadiness
    public let livedReadiness: DailyConversationReadiness
    public let context: LivingContext
    public let supportingThreads: [CommonGroundThread]
    public let noActionReason: String?

    public var canSurfacePlaces: Bool {
        outsideReadiness == .ready && livedReadiness == .ready
    }
}

public enum ActivityScope: String, CaseIterable, Identifiable, Sendable {
    case needsYou
    case open
    case watching
    case handled
    case all

    public var id: Self { self }

    public var title: String {
        switch self {
        case .needsYou: "Needs you"
        case .open: "Open"
        case .watching: "Watching"
        case .handled: "Handled"
        case .all: "All activity"
        }
    }
}

public enum QuietDeskPresentationPolicy {
    /// The Daily Conversation may draw on only a deliberately small set of
    /// recurring human conversations. Source activity remains one level deeper.
    public static let maximumTopLevelThreads = 3
    public static let maximumPeoplePerThread = 3
    public static let maximumSupportingThreadsForShortConversation = 1
    public static let maximumSupportingThreadsForDeepConversation = 3
}

public enum ConnectionKind: String, CaseIterable, Identifiable, Sendable {
    case sources
    case agents

    public var id: Self { self }

    public var title: String {
        switch self {
        case .sources: "Sources"
        case .agents: "Agents"
        }
    }
}

public enum FeedFilter: String, CaseIterable, Codable, Sendable {
    case today
    case needsYou
    case slowFeed
    case handled
    case watching

    public var title: String {
        switch self {
        case .today: "Today"
        case .needsYou: "Needs You"
        case .slowFeed: "Slow Feed"
        case .handled: "Handled"
        case .watching: "Watching"
        }
    }
}

public enum FeedItemStatus: String, CaseIterable, Codable, Sendable {
    case needsYou
    case watching
    case handled
    case context

    public var label: String {
        switch self {
        case .needsYou: "Needs you"
        case .watching: "Watching"
        case .handled: "Handled"
        case .context: "Context"
        }
    }
}

public enum ProofKind: String, CaseIterable, Codable, Hashable, Sendable {
    case proposed
    case approved
    case providerAcknowledged
    case delivered
    case read

    public var label: String {
        switch self {
        case .proposed: "Proposed"
        case .approved: "Approved"
        case .providerAcknowledged: "Provider acknowledged"
        case .delivered: "Delivered"
        case .read: "Read"
        }
    }

}

/// An independent set of evidenced facts about an external action.
///
/// There is deliberately no stage ordering here. For example, provider acknowledgement
/// does not establish approval or delivery, and read evidence does not establish delivery.
public struct ProofLedger: Codable, Hashable, Sendable {
    public private(set) var evidence: Set<ProofKind>

    public init(_ evidence: Set<ProofKind> = []) {
        self.evidence = evidence
    }

    public func contains(_ kind: ProofKind) -> Bool {
        evidence.contains(kind)
    }

    public mutating func record(_ kind: ProofKind) {
        evidence.insert(kind)
    }

    public var orderedEvidence: [ProofKind] {
        ProofKind.allCases.filter(evidence.contains)
    }

    public var hasDeliveryEvidence: Bool {
        contains(.delivered)
    }

    public var hasReadEvidence: Bool {
        contains(.read)
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.evidence = Set(try container.decode([ProofKind].self))
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(orderedEvidence)
    }
}

public enum RunState: String, CaseIterable, Codable, Sendable {
    case queued
    case running
    case waitingForApproval
    case waitingForHub
    case completed
    case failed

    public var label: String {
        switch self {
        case .queued: "Queued"
        case .running: "Running"
        case .waitingForApproval: "Waiting for approval"
        case .waitingForHub: "Waiting for hub"
        case .completed: "Run complete"
        case .failed: "Run failed"
        }
    }
}

public enum EvidenceKind: String, CaseIterable, Codable, Sendable {
    case direct
    case derived
    case inferred

    public var label: String {
        switch self {
        case .direct: "Direct source"
        case .derived: "Derived"
        case .inferred: "Inference"
        }
    }
}

public enum ActionKind: String, Codable, Sendable {
    case sendMessage
    case createCalendarEvent
    case publishPost
    case updateRSVP

    public var label: String {
        switch self {
        case .sendMessage: "Send message"
        case .createCalendarEvent: "Create calendar event"
        case .publishPost: "Publish post"
        case .updateRSVP: "Update RSVP"
        }
    }

    public var isExternal: Bool { true }
}

public enum AgentAvailability: String, Codable, Sendable {
    case ready
    case paused
    case needsAttention

    public var label: String {
        switch self {
        case .ready: "Ready"
        case .paused: "Paused"
        case .needsAttention: "Needs attention"
        }
    }
}

public enum SourceHealth: String, Codable, Sendable {
    case connected
    case degraded
    case paused

    public var label: String {
        switch self {
        case .connected: "Connected"
        case .degraded: "Degraded"
        case .paused: "Paused"
        }
    }
}

public struct ExecutorDescriptor: Codable, Hashable, Sendable {
    public let provider: String
    public let executor: String
    public let runtime: String
}

public struct EvidenceClaim: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let claim: String
    public let kind: EvidenceKind
    public let sourceID: UUID
    public let sourceTitle: String
    public let sourceURL: String
    public let sourceCapturedAt: Date
    public let excerpt: String

    /// A source door is exposed only for an explicit, user-initiated HTTP(S) navigation.
    public var userOpenableSourceURL: URL? {
        guard !sourceURL.unicodeScalars.contains(where: {
            CharacterSet.whitespacesAndNewlines.contains($0)
                || CharacterSet.controlCharacters.contains($0)
        }),
            let components = URLComponents(string: sourceURL),
            let scheme = components.scheme?.lowercased(),
            scheme == "http" || scheme == "https",
            let host = components.host,
            !host.isEmpty,
            let url = components.url
        else { return nil }

        return url
    }
}

public struct ProposedAction: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let revision: Int
    public let kind: ActionKind
    public let account: String
    public let channel: String
    public let target: String
    public let exactPayload: String
    public let requiresExplicitApproval: Bool

    /// SHA-256 of canonical, provider-bound JSON. Revision is bound separately by the receipt.
    public var payloadSHA256: String {
        SHA256.hash(data: canonicalProviderPayload)
            .map { String(format: "%02x", $0) }
            .joined()
    }

    public var shortPayloadHash: String {
        String(payloadSHA256.prefix(12))
    }

    private var canonicalProviderPayload: Data {
        let payload = CanonicalProviderPayload(
            account: account,
            channel: channel,
            target: target,
            body: exactPayload
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]

        // This value contains only non-optional strings, so encoding cannot fail in practice.
        return (try? encoder.encode(payload)) ?? Data()
    }

    private struct CanonicalProviderPayload: Encodable {
        let account: String
        let channel: String
        let target: String
        let body: String
    }
}

public struct AgentRun: Codable, Hashable, Sendable {
    public let id: UUID
    public var state: RunState
    public var summary: String
    public var lastUpdatedAt: Date
}

public struct FeedItem: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let timestamp: Date
    public let headline: String
    public let whyItMatters: String
    public let status: FeedItemStatus
    public let agentID: UUID
    public let executor: ExecutorDescriptor
    public let claims: [EvidenceClaim]
    public var run: AgentRun
    public let action: ProposedAction?
    public var proofLedger: ProofLedger

    public var searchableText: String {
        let claimText = claims
            .flatMap { [$0.claim, $0.sourceTitle, $0.excerpt] }
            .joined(separator: " ")
        let actionText = action.map { "\($0.target) \($0.channel) \($0.exactPayload)" } ?? ""
        return [
            headline,
            whyItMatters,
            status.label,
            executor.provider,
            executor.executor,
            claimText,
            actionText,
        ].joined(separator: " ")
    }

    /// A proposal that is already approved no longer asks the person for a
    /// decision, even if an upstream fixture has not yet changed its status.
    public var needsUserAttention: Bool {
        guard status == .needsYou else { return false }
        return action == nil || !proofLedger.contains(.approved)
    }
}

public enum ContextStatementKind: String, CaseIterable, Codable, Sendable {
    case priority
    case livedExperience
    case project
    case position

    public var label: String {
        switch self {
        case .priority: "Priority"
        case .livedExperience: "Lived experience"
        case .project: "Project"
        case .position: "Position"
        }
    }
}

public enum ContextBasis: String, CaseIterable, Codable, Sendable {
    case explicit
    case observed
    case inferred

    public var label: String {
        switch self {
        case .explicit: "You said this"
        case .observed: "Observed over time"
        case .inferred: "Needs confirmation"
        }
    }
}

/// One inspectable part of the person's evolving context representation.
///
/// Inference is never silently upgraded into an explicit belief. Observed and
/// inferred statements retain the feed items that support the projection.
public struct ContextStatement: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let kind: ContextStatementKind
    public let statement: String
    public let basis: ContextBasis
    public let confidence: Double
    public let updatedAt: Date
    public let sourceFeedItemIDs: [UUID]

    public var needsConfirmation: Bool { basis == .inferred }
}

public struct LivingContext: Codable, Hashable, Sendable {
    public let revision: Int
    public let updatedAt: Date
    public let summary: String
    public let statements: [ContextStatement]

    public static func empty(updatedAt: Date = .distantPast) -> LivingContext {
        LivingContext(revision: 0, updatedAt: updatedAt, summary: "", statements: [])
    }

    public func statement(id: UUID) -> ContextStatement? {
        statements.first { $0.id == id }
    }
}

public enum CommonGroundStage: String, CaseIterable, Codable, Sendable {
    case listening
    case commonGround
    case peopleFound
    case handoffReady

    public var label: String {
        switch self {
        case .listening: "Still listening"
        case .commonGround: "Common ground"
        case .peopleFound: "People found"
        case .handoffReady: "Handoff ready"
        }
    }
}

/// The visible narrowing from broad network repetition to a number of people a
/// person could plausibly know and act with.
public struct ThreadNarrowing: Codable, Hashable, Sendable {
    public let voicesObserved: Int
    public let sharedInterest: Int
    public let sharedIntent: Int
    public let peopleWithinReach: Int

    public var isValid: Bool {
        voicesObserved >= sharedInterest
            && sharedInterest >= sharedIntent
            && sharedIntent >= peopleWithinReach
            && peopleWithinReach > 0
            && peopleWithinReach <= QuietDeskPresentationPolicy.maximumPeoplePerThread
    }
}

public struct RelevantPerson: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let name: String
    public let relationship: String
    public let sharedIntent: String
    public let whyRelevant: String
    public let location: String?
    /// A clearly synthetic or provider-owned route shown only when the source
    /// evidence says an introduction is welcome. Never a secret credential.
    public let targetIdentifier: String?
    public let evidenceClaimIDs: [UUID]
}

/// A recurring, evidence-backed conversation that matches the person's living
/// context and has been narrowed toward a human-scale next step.
public struct CommonGroundThread: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let updatedAt: Date
    public let title: String
    public let commonGround: String
    public let whyItFits: String
    public let whyNow: String
    public let stage: CommonGroundStage
    public let narrowing: ThreadNarrowing
    public let contextStatementIDs: [UUID]
    public let claims: [EvidenceClaim]
    public let people: [RelevantPerson]
    public let handoffFeedItemID: UUID?

    public var searchableText: String {
        let claimText = claims
            .flatMap { [$0.claim, $0.sourceTitle, $0.excerpt] }
            .joined(separator: " ")
        let peopleText = people
            .flatMap { [$0.name, $0.relationship, $0.sharedIntent, $0.whyRelevant, $0.location ?? ""] }
            .joined(separator: " ")
        return [title, commonGround, whyItFits, whyNow, stage.label, claimText, peopleText]
            .joined(separator: " ")
    }
}

public struct AgentProfile: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let name: String
    public let role: String
    public let systemImage: String
    public let mission: String
    public let availability: AgentAvailability
    public let executor: ExecutorDescriptor
    public let permissions: [String]
    public let lastRunAt: Date?
}

public struct SourceProfile: Identifiable, Codable, Hashable, Sendable {
    public let id: UUID
    public let name: String
    public let kind: String
    public let systemImage: String
    public let health: SourceHealth
    public let scope: String
    public let lastIngestedAt: Date?
    public let itemCount: Int
}

public struct QuietDeskSnapshot: Codable, Hashable, Sendable {
    public let generatedAt: Date
    public let isSynthetic: Bool
    public var items: [FeedItem]
    public let agents: [AgentProfile]
    public let sources: [SourceProfile]
    public let personalContext: LivingContext
    public let threads: [CommonGroundThread]

    private enum CodingKeys: String, CodingKey {
        case generatedAt
        case isSynthetic
        case items
        case agents
        case sources
        case personalContext
        case threads
    }

    public init(
        generatedAt: Date,
        isSynthetic: Bool,
        items: [FeedItem],
        agents: [AgentProfile],
        sources: [SourceProfile],
        personalContext: LivingContext = .empty(),
        threads: [CommonGroundThread] = []
    ) {
        self.generatedAt = generatedAt
        self.isSynthetic = isSynthetic
        self.items = items
        self.agents = agents
        self.sources = sources
        self.personalContext = personalContext
        self.threads = threads
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        generatedAt = try container.decode(Date.self, forKey: .generatedAt)
        isSynthetic = try container.decode(Bool.self, forKey: .isSynthetic)
        items = try container.decode([FeedItem].self, forKey: .items)
        agents = try container.decode([AgentProfile].self, forKey: .agents)
        sources = try container.decode([SourceProfile].self, forKey: .sources)
        personalContext = try container.decodeIfPresent(LivingContext.self, forKey: .personalContext)
            ?? .empty(updatedAt: generatedAt)
        threads = try container.decodeIfPresent([CommonGroundThread].self, forKey: .threads) ?? []
    }

    public static func emptySynthetic(generatedAt: Date = .distantPast) -> QuietDeskSnapshot {
        QuietDeskSnapshot(
            generatedAt: generatedAt,
            isSynthetic: true,
            items: [],
            agents: [],
            sources: [],
            personalContext: .empty(updatedAt: generatedAt),
            threads: []
        )
    }

    public func agent(id: UUID) -> AgentProfile? {
        agents.first { $0.id == id }
    }

    public func source(id: UUID) -> SourceProfile? {
        sources.first { $0.id == id }
    }

    public func thread(id: UUID) -> CommonGroundThread? {
        threads.first { $0.id == id }
    }

    public func contextStatement(id: UUID) -> ContextStatement? {
        personalContext.statement(id: id)
    }

    public func conversationThreads(query: String = "") -> [CommonGroundThread] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return threads
            .filter { thread in
                trimmed.isEmpty || thread.searchableText.localizedCaseInsensitiveContains(trimmed)
            }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    public func topLevelThreads() -> [CommonGroundThread] {
        Array(conversationThreads().prefix(QuietDeskPresentationPolicy.maximumTopLevelThreads))
    }

    /// Builds the product-facing conversation preview without upgrading sample
    /// data into live evidence or treating an inferred day as human-authored.
    public func dailyConversationProjection(
        for mode: DailyConversationMode
    ) -> DailyConversationProjection {
        let threadLimit: Int
        switch mode {
        case .notChecked, .noNewInput:
            threadLimit = 0
        case .short:
            threadLimit = QuietDeskPresentationPolicy.maximumSupportingThreadsForShortConversation
        case .deep:
            threadLimit = QuietDeskPresentationPolicy.maximumSupportingThreadsForDeepConversation
        }

        let noActionReason: String?
        switch mode {
        case .notChecked:
            noActionReason = nil
        case .noNewInput:
            noActionReason = "No new outside context was introduced for this check-in."
        case .short, .deep:
            noActionReason = "No Place was proposed because fresh outside context and a confirmed account of today are not both connected."
        }

        return DailyConversationProjection(
            mode: mode,
            outsideReadiness: isSynthetic ? .sampleOnly : .notConnected,
            livedReadiness: .notConnected,
            context: personalContext,
            supportingThreads: Array(topLevelThreads().prefix(threadLimit)),
            noActionReason: noActionReason
        )
    }

    public func filteredItems(
        for filter: FeedFilter,
        query: String = "",
        calendar: Calendar = Calendar(identifier: .gregorian)
    ) -> [FeedItem] {
        items
            .filter { item in
                switch filter {
                case .today:
                    calendar.isDate(item.timestamp, inSameDayAs: generatedAt)
                case .needsYou:
                    item.status == .needsYou
                case .slowFeed:
                    item.status != .handled
                case .handled:
                    item.status == .handled
                case .watching:
                    item.status == .watching
                }
            }
            .filter { item in
                matches(item, query: query)
            }
            .sorted { $0.timestamp > $1.timestamp }
    }

    /// The only items admitted to the default surface: things explicitly marked
    /// as requiring the person's attention.
    public func attentionItems(query: String = "") -> [FeedItem] {
        items
            .filter(\.needsUserAttention)
            .filter { matches($0, query: query) }
            .sorted { $0.timestamp > $1.timestamp }
    }

    /// Secondary history with operational states exposed as a scoped filter.
    public func activityItems(for scope: ActivityScope, query: String = "") -> [FeedItem] {
        items
            .filter { item in
                switch scope {
                case .needsYou:
                    item.needsUserAttention
                case .open:
                    item.status != .handled
                case .watching:
                    item.status == .watching
                case .handled:
                    item.status == .handled
                case .all:
                    true
                }
            }
            .filter { matches($0, query: query) }
            .sorted { $0.timestamp > $1.timestamp }
    }

    public var approvalPolicyViolations: [UUID] {
        items.compactMap { item in
            guard let action = item.action,
                  action.kind.isExternal,
                  !action.requiresExplicitApproval
            else { return nil }
            return item.id
        }
    }

    /// Cross-record checks for the synthetic product projection. A thread must
    /// retain exact context, source, person-evidence, and handoff references.
    public var contextReferenceViolations: [UUID] {
        let feedItemIDs = Set(items.map(\.id))
        return personalContext.statements.compactMap { statement in
            let hasValidConfidence = (0...1).contains(statement.confidence)
            let hasRequiredEvidence = statement.basis == .explicit || !statement.sourceFeedItemIDs.isEmpty
            let referencesResolve = statement.sourceFeedItemIDs.allSatisfy(feedItemIDs.contains)
            return hasValidConfidence && hasRequiredEvidence && referencesResolve ? nil : statement.id
        }
    }

    public var threadReferenceViolations: [UUID] {
        let contextIDs = Set(personalContext.statements.map(\.id))
        let sourceIDs = Set(sources.map(\.id))
        let feedItemsByID = Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })

        return threads.compactMap { thread in
            let claimIDs = Set(thread.claims.map(\.id))
            let contextResolves = !thread.contextStatementIDs.isEmpty
                && thread.contextStatementIDs.allSatisfy(contextIDs.contains)
            let claimsResolve = !thread.claims.isEmpty
                && thread.claims.allSatisfy { sourceIDs.contains($0.sourceID) }
            let peopleResolve = !thread.people.isEmpty
                && thread.people.count <= QuietDeskPresentationPolicy.maximumPeoplePerThread
                && thread.people.count == thread.narrowing.peopleWithinReach
                && thread.people.allSatisfy { person in
                    !person.evidenceClaimIDs.isEmpty
                        && person.evidenceClaimIDs.allSatisfy(claimIDs.contains)
                }
            let handoffResolves: Bool
            if let handoffID = thread.handoffFeedItemID,
               let handoff = feedItemsByID[handoffID],
               let action = handoff.action {
                let targetIdentifiers = thread.people.compactMap(\.targetIdentifier)
                handoffResolves = handoff.proofLedger.contains(.proposed)
                    && action.requiresExplicitApproval
                    && targetIdentifiers.count == thread.people.count
                    && targetIdentifiers.allSatisfy(action.target.contains)
            } else {
                handoffResolves = thread.handoffFeedItemID == nil && thread.stage != .handoffReady
            }

            return contextResolves
                && claimsResolve
                && peopleResolve
                && thread.narrowing.isValid
                && handoffResolves
                ? nil
                : thread.id
        }
    }

    private func matches(_ item: FeedItem, query: String) -> Bool {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty
            || item.searchableText.localizedCaseInsensitiveContains(trimmed)
            || (agent(id: item.agentID)?.name.localizedCaseInsensitiveContains(trimmed) ?? false)
    }
}

public struct ApprovalReceipt: Identifiable, Hashable, Sendable {
    public let id: UUID
    public let itemID: UUID
    public let actionID: UUID
    public let actionRevision: Int
    public let approvedAt: Date
    public let payloadSHA256: String
    public let recordedEvidence: ProofKind
    public let note: String
}
