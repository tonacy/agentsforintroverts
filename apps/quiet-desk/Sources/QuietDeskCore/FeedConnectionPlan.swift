import Foundation

/// The side of the Desk a feed belongs to.
///
/// These values describe a permission plan. They do not grant access and they
/// must never be interpreted as connection proof.
public enum FeedBoundary: String, CaseIterable, Codable, Hashable, Identifiable, Sendable {
    case outsideInput = "outside_input"
    case insideRecall = "inside_recall"
    case publicOutput = "public_output"

    public var id: Self { self }

    public var title: String {
        switch self {
        case .outsideInput: "Outside context"
        case .insideRecall: "Inside recall"
        case .publicOutput: "Publishing"
        }
    }

    public var explanation: String {
        switch self {
        case .outsideInput:
            "Read-only signals from the world. They cannot read your Inside context."
        case .insideRecall:
            "Private cues that help you remember your day. They do not become public context by themselves."
        case .publicOutput:
            "Places your released public context may be expressed. Publishing stays separate from discovery."
        }
    }
}

public enum FeedPermissionMode: String, CaseIterable, Codable, Hashable, Identifiable, Sendable {
    case readOnly = "read_only"
    case reviewEveryItem = "review_every_item"
    case standingPolicy = "standing_policy"
    case manualOnly = "manual_only"

    public var id: Self { self }

    public var title: String {
        switch self {
        case .readOnly: "Read only"
        case .reviewEveryItem: "Clear every item"
        case .standingPolicy: "Use a standing policy"
        case .manualOnly: "Prepare drafts only"
        }
    }

    public var explanation: String {
        switch self {
        case .readOnly:
            "The adapter may observe only the configured scope and cannot react or publish."
        case .reviewEveryItem:
            "Every exact post or publish must return to you before it can leave the Desk."
        case .standingPolicy:
            "Established public context may move within a policy you approve; new beliefs and commitments still return to you."
        case .manualOnly:
            "Agents may prepare a draft, but you publish it yourself in the destination."
        }
    }
}

public enum FeedConnectionID: String, CaseIterable, Codable, Hashable, Identifiable, Sendable {
    case xFollowing = "x_following"
    case linkedInOrganic = "linkedin_organic"
    case computerHistoryToday = "computer_history_today"
    case xPublishing = "x_publishing"
    case linkedInPublishing = "linkedin_publishing"
    case substackPublishing = "substack_publishing"

    public var id: Self { self }

    public var title: String {
        switch self {
        case .xFollowing: "X · Following"
        case .linkedInOrganic: "LinkedIn · Organic"
        case .computerHistoryToday: "Computer History · Today"
        case .xPublishing: "X · Publishing"
        case .linkedInPublishing: "LinkedIn · Publishing"
        case .substackPublishing: "Substack · Publishing"
        }
    }

    public var serviceName: String {
        switch self {
        case .xFollowing, .xPublishing: "X"
        case .linkedInOrganic, .linkedInPublishing: "LinkedIn"
        case .computerHistoryToday: "Computer History"
        case .substackPublishing: "Substack"
        }
    }

    public var systemImage: String {
        switch self {
        case .xFollowing: "text.bubble"
        case .linkedInOrganic: "person.2"
        case .computerHistoryToday: "clock.arrow.circlepath"
        case .xPublishing: "paperplane"
        case .linkedInPublishing: "person.crop.rectangle.stack"
        case .substackPublishing: "newspaper"
        }
    }

    public var boundary: FeedBoundary {
        switch self {
        case .xFollowing, .linkedInOrganic: .outsideInput
        case .computerHistoryToday: .insideRecall
        case .xPublishing, .linkedInPublishing, .substackPublishing: .publicOutput
        }
    }

    public var purpose: String {
        switch self {
        case .xFollowing:
            "A bounded pass over Following. For You, Explore, trends, ads, notifications, and messages stay out."
        case .linkedInOrganic:
            "Organic home-feed posts only. Sponsored, suggested, invitations, messages, and the profile graph stay out."
        case .computerHistoryToday:
            "Current-day recall cues for calibration. A cue is not your belief, emotion, intent, or a completed task."
        case .xPublishing:
            "Publish without entering the discovery feed. Reading permission is configured separately."
        case .linkedInPublishing:
            "Adapt released public context for LinkedIn without granting access to messages or the relationship graph."
        case .substackPublishing:
            "Prepare or publish field notes. Subscriber access and publishing permission are separate."
        }
    }

    public var authorizedScope: String {
        switch self {
        case .xFollowing: "Following timeline only · bounded read"
        case .linkedInOrganic: "Organic home feed only · bounded read"
        case .computerHistoryToday: "Current local day · recall cues only"
        case .xPublishing: "Original posts and approved public replies"
        case .linkedInPublishing: "Original posts from released public context"
        case .substackPublishing: "Publication drafts or publishes"
        }
    }

    public var retention: String {
        switch self {
        case .xFollowing, .linkedInOrganic, .computerHistoryToday:
            "Unconfirmed cues expire within 24 hours. Only minimized, revalidated public evidence or confirmed human wording may persist."
        case .xPublishing, .linkedInPublishing, .substackPublishing:
            "Keep the policy revision, exact payload, receipt, public URL, and any correction."
        }
    }

    public var requiresAccountIdentifier: Bool {
        self != .computerHistoryToday
    }

    public var accountPrompt: String {
        switch self {
        case .xFollowing, .xPublishing: "Expected @handle"
        case .linkedInOrganic, .linkedInPublishing: "Expected LinkedIn identity"
        case .substackPublishing: "Publication or @handle"
        case .computerHistoryToday: ""
        }
    }

    public var allowedPermissions: [FeedPermissionMode] {
        switch boundary {
        case .outsideInput, .insideRecall: [.readOnly]
        case .publicOutput: [.reviewEveryItem, .standingPolicy, .manualOnly]
        }
    }

    public var defaultPermission: FeedPermissionMode {
        switch boundary {
        case .outsideInput, .insideRecall: .readOnly
        case .publicOutput: .reviewEveryItem
        }
    }

    public var requiredReceiptChecks: Set<String> {
        switch self {
        case .computerHistoryToday:
            ["current_local_day", "segment_readable"]
        case .xFollowing:
            ["account_visible", "account_matches", "following_selected", "bounded_read_completed"]
        case .linkedInOrganic, .xPublishing, .linkedInPublishing, .substackPublishing:
            []
        }
    }

    public var maximumReceiptLifetime: TimeInterval {
        switch self {
        case .computerHistoryToday: 15 * 60
        case .xFollowing: 60 * 60
        case .linkedInOrganic, .xPublishing, .linkedInPublishing, .substackPublishing: 0
        }
    }
}

/// A locally saved plan for a future source or publisher adapter.
///
/// `isEnabled` means “include this in my requested setup.” It never means an
/// account is authenticated, a credential exists, or an adapter has run.
public struct FeedConnectionPlan: Codable, Hashable, Identifiable, Sendable {
    public var id: FeedConnectionID
    public var isEnabled: Bool
    public var accountIdentifier: String
    public var permission: FeedPermissionMode

    public init(
        id: FeedConnectionID,
        isEnabled: Bool = false,
        accountIdentifier: String = "",
        permission: FeedPermissionMode? = nil
    ) {
        self.id = id
        self.isEnabled = isEnabled
        self.accountIdentifier = accountIdentifier
        self.permission = permission ?? id.defaultPermission
    }

    public var normalizedAccountIdentifier: String {
        accountIdentifier.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public var validationMessage: String? {
        guard isEnabled else { return nil }
        if id.requiresAccountIdentifier && normalizedAccountIdentifier.isEmpty {
            return "Add the exact identity Quiet Desk must verify before using this feed."
        }
        if [.xFollowing, .xPublishing].contains(id), !normalizedAccountIdentifier.hasPrefix("@") {
            return "Use the exact X handle beginning with @."
        }
        if !id.allowedPermissions.contains(permission) {
            return "This permission does not match the feed boundary."
        }
        return nil
    }

    public var isReadyToAuthorize: Bool {
        isEnabled && validationMessage == nil
    }

    public static var defaults: [FeedConnectionPlan] {
        FeedConnectionID.allCases.map { FeedConnectionPlan(id: $0) }
    }

    public static func normalized(_ plans: [FeedConnectionPlan]) -> [FeedConnectionPlan] {
        let byID = Dictionary(plans.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return FeedConnectionID.allCases.map { id in
            var plan = byID[id] ?? FeedConnectionPlan(id: id)
            plan.accountIdentifier = plan.normalizedAccountIdentifier
            if !id.allowedPermissions.contains(plan.permission) {
                plan.permission = id.defaultPermission
            }
            return plan
        }
    }
}
