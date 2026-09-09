import Foundation

/// A minimized, short-lived observation that may enter one Daily Conversation.
///
/// Cues remain outside the durable Context Kernel. An Inside cue is not a
/// statement about the person, and an Outside cue is not a citable source
/// record. Both require a matching, fresh connection receipt when recorded.
public struct FeedCue: Codable, Hashable, Identifiable, Sendable {
    public let schema: String
    public let id: String
    public let feedID: FeedConnectionID
    public let boundary: FeedBoundary
    public let planRevision: Int
    public let planHash: String
    public let receiptID: String
    public let minimizedCue: String
    public let observedAt: Date
    public let recordedAt: Date
    public let expiresAt: Date
    public let sourceDoors: [URL]
    public let uncertain: Bool
    public let requiresCalibration: Bool

    public init(
        id: String = UUID().uuidString.lowercased(),
        feedID: FeedConnectionID,
        boundary: FeedBoundary,
        planRevision: Int,
        planHash: String,
        receiptID: String,
        minimizedCue: String,
        observedAt: Date,
        recordedAt: Date,
        expiresAt: Date,
        sourceDoors: [URL] = [],
        uncertain: Bool = true,
        requiresCalibration: Bool = true
    ) {
        self.schema = "afi.feed_cue.v1"
        self.id = id
        self.feedID = feedID
        self.boundary = boundary
        self.planRevision = planRevision
        self.planHash = planHash
        self.receiptID = receiptID
        self.minimizedCue = minimizedCue
        self.observedAt = observedAt
        self.recordedAt = recordedAt
        self.expiresAt = expiresAt
        self.sourceDoors = sourceDoors
        self.uncertain = uncertain
        self.requiresCalibration = requiresCalibration
    }

    public var isActive: Bool {
        expiresAt > Date()
    }

    public func isActive(at date: Date) -> Bool {
        expiresAt > date
    }

    public func validationMessage(
        plan: FeedConnectionPlan,
        document: FeedPlanDocument,
        receipt: FeedConnectionReceipt,
        now: Date
    ) -> String? {
        guard schema == "afi.feed_cue.v1",
              UUID(uuidString: id) != nil,
              feedID == plan.id,
              boundary == plan.id.boundary,
              boundary == .insideRecall || boundary == .outsideInput,
              plan.isEnabled,
              plan.permission == .readOnly,
              planRevision == document.revision,
              planHash == document.planHash,
              receiptID == receipt.id,
              receipt.feedID == feedID,
              receipt.status == .verified,
              receipt.allChecksPassed
        else { return "The cue does not match the current verified feed boundary." }

        if let receiptProblem = receipt.validationMessage(plan: plan, document: document, now: recordedAt) {
            return receiptProblem
        }
        guard recordedAt >= receipt.verifiedAt,
              recordedAt <= receipt.expiresAt,
              recordedAt <= now.addingTimeInterval(5 * 60)
        else { return "The cue was not recorded during the receipt's freshness window." }
        guard observedAt <= recordedAt.addingTimeInterval(5 * 60),
              observedAt >= receipt.verifiedAt.addingTimeInterval(-plan.id.maximumReceiptLifetime)
        else { return "The cue observation falls outside the bounded read window." }
        guard expiresAt > recordedAt,
              expiresAt.timeIntervalSince(recordedAt) <= 24 * 60 * 60
        else { return "The cue must expire within 24 hours." }

        let normalizedCue = minimizedCue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedCue.isEmpty,
              normalizedCue.count <= 512,
              !normalizedCue.contains("\n"),
              !normalizedCue.contains("\r")
        else { return "The cue must be one minimized line of at most 512 characters." }
        guard sourceDoors.count <= 3,
              sourceDoors.allSatisfy(Self.isSafeSourceDoor)
        else { return "Cue source doors must be bounded HTTP or HTTPS links." }
        guard uncertain, requiresCalibration else {
            return "Feed cues must remain uncertain and require human calibration."
        }

        switch feedID {
        case .computerHistoryToday:
            guard boundary == .insideRecall,
                  sourceDoors.isEmpty
            else { return "Computer History cues must remain uncertain, private recall without a source door." }
        case .xFollowing:
            guard boundary == .outsideInput,
                  !sourceDoors.isEmpty,
                  sourceDoors.allSatisfy({ Self.isXSourceDoor($0) })
            else { return "X Following cues require at least one user-openable X source door." }
        case .linkedInOrganic, .xPublishing, .linkedInPublishing, .substackPublishing:
            return "Cue intake is not implemented for this feed."
        }
        return nil
    }

    private static func isSafeSourceDoor(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              url.host != nil,
              url.user == nil,
              url.password == nil
        else { return false }
        return true
    }

    private static func isXSourceDoor(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host == "x.com" || host.hasSuffix(".x.com")
    }
}
