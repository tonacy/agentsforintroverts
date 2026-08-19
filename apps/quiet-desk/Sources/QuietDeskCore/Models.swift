import CryptoKit
import Foundation

/// The deliberately small, user-facing information architecture.
///
/// Operational states such as handled and watching are activity filters, not
/// competing top-level destinations. Agents and sources share Connections.
public enum QuietDeskDestination: String, CaseIterable, Identifiable, Sendable {
    case now
    case activity
    case connections

    public var id: Self { self }

    public static let initial: QuietDeskDestination = .now

    public var title: String {
        switch self {
        case .now: "Now"
        case .activity: "Activity"
        case .connections: "Agents & Sources"
        }
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
    /// The default surface always stays scannable. The complete queue remains
    /// available through Activity > Needs you.
    public static let maximumTopLevelAttentionItems = 3
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

    public static func emptySynthetic(generatedAt: Date = .distantPast) -> QuietDeskSnapshot {
        QuietDeskSnapshot(
            generatedAt: generatedAt,
            isSynthetic: true,
            items: [],
            agents: [],
            sources: []
        )
    }

    public func agent(id: UUID) -> AgentProfile? {
        agents.first { $0.id == id }
    }

    public func source(id: UUID) -> SourceProfile? {
        sources.first { $0.id == id }
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

    public func topLevelAttentionItems() -> [FeedItem] {
        Array(attentionItems().prefix(QuietDeskPresentationPolicy.maximumTopLevelAttentionItems))
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
