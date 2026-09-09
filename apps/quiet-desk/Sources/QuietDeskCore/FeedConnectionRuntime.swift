import CryptoKit
import Foundation

public enum FeedConnectionReceiptStatus: String, Codable, Hashable, Sendable {
    case verified
    case partial
    case unavailable
}

public struct FeedConnectionCheck: Codable, Hashable, Sendable {
    public let name: String
    public let passed: Bool
    public let detail: String

    public init(name: String, passed: Bool, detail: String) {
        self.name = name
        self.passed = passed
        self.detail = detail
    }
}

/// A short-lived report that an adapter actually exercised the configured
/// boundary. A receipt reports evidence; it cannot grant or broaden access.
public struct FeedConnectionReceipt: Codable, Hashable, Identifiable, Sendable {
    public let schema: String
    public let id: String
    public let feedID: FeedConnectionID
    public let planRevision: Int
    public let planHash: String
    public let adapter: String
    public let expectedIdentity: String
    public let observedIdentity: String?
    public let permission: FeedPermissionMode
    public let scope: String
    public let status: FeedConnectionReceiptStatus
    public let verifiedAt: Date
    public let expiresAt: Date
    public let lastSuccessfulReadAt: Date?
    public let checks: [FeedConnectionCheck]
    public let summary: String

    public init(
        id: String = UUID().uuidString.lowercased(),
        feedID: FeedConnectionID,
        planRevision: Int,
        planHash: String,
        adapter: String,
        expectedIdentity: String,
        observedIdentity: String?,
        permission: FeedPermissionMode,
        scope: String,
        status: FeedConnectionReceiptStatus,
        verifiedAt: Date,
        expiresAt: Date,
        lastSuccessfulReadAt: Date?,
        checks: [FeedConnectionCheck],
        summary: String
    ) {
        self.schema = "afi.feed_connection_receipt.v1"
        self.id = id
        self.feedID = feedID
        self.planRevision = planRevision
        self.planHash = planHash
        self.adapter = adapter
        self.expectedIdentity = expectedIdentity
        self.observedIdentity = observedIdentity
        self.permission = permission
        self.scope = scope
        self.status = status
        self.verifiedAt = verifiedAt
        self.expiresAt = expiresAt
        self.lastSuccessfulReadAt = lastSuccessfulReadAt
        self.checks = checks
        self.summary = summary
    }

    public var allChecksPassed: Bool {
        !checks.isEmpty && checks.allSatisfy(\.passed)
    }

    public func validationMessage(
        plan: FeedConnectionPlan,
        document: FeedPlanDocument,
        now: Date
    ) -> String? {
        guard feedID == plan.id,
              planRevision == document.revision,
              planHash == document.planHash,
              permission == plan.permission,
              expectedIdentity == plan.normalizedAccountIdentifier,
              scope == plan.id.authorizedScope
        else { return "The receipt does not match the current feed plan." }

        if feedID == .xFollowing {
            let normalize: (String) -> String = { value in
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                return trimmed.hasPrefix("@") ? String(trimmed.dropFirst()) : trimmed
            }
            let expected = normalize(expectedIdentity)
            let observed = normalize(observedIdentity ?? "")
            guard !expected.isEmpty, expected == observed else {
                return "The visibly verified X account does not match the saved identity."
            }
        }

        guard expiresAt > verifiedAt,
              expiresAt.timeIntervalSince(verifiedAt) <= plan.id.maximumReceiptLifetime
        else { return "The receipt exceeds its allowed freshness window." }
        guard verifiedAt <= now.addingTimeInterval(5 * 60) else {
            return "The receipt verification time is in the future."
        }

        if status == .verified {
            let passed = Set(checks.filter(\.passed).map(\.name))
            guard allChecksPassed, plan.id.requiredReceiptChecks.isSubset(of: passed) else {
                return "The receipt did not pass every required source check."
            }
            if feedID == .computerHistoryToday,
               !passed.contains("history_running"),
               !passed.contains("recent_segment") {
                return "The receipt did not prove that Computer History is currently active."
            }
        }
        return nil
    }
}

public struct FeedPlanDocument: Codable, Hashable, Sendable {
    public let schema: String
    public let revision: Int
    public let updatedAt: Date
    public let planHash: String
    public let plans: [FeedConnectionPlan]

    public init(revision: Int, updatedAt: Date, plans: [FeedConnectionPlan]) throws {
        let normalized = FeedConnectionPlan.normalized(plans)
        self.schema = "afi.feed_plan.v1"
        self.revision = revision
        self.updatedAt = updatedAt
        self.planHash = try FeedStateCoding.hash(plans: normalized)
        self.plans = normalized
    }

    public func plan(for id: FeedConnectionID) -> FeedConnectionPlan? {
        plans.first { $0.id == id }
    }
}

public enum FeedConnectionPhase: Equatable, Sendable {
    case notRequested
    case awaitingVerification
    case verified(until: Date)
    case stale(lastVerifiedAt: Date)
    case partial(String)
    case unavailable(String)

    public var title: String {
        switch self {
        case .notRequested: "Not selected"
        case .awaitingVerification: "Awaiting verification"
        case .verified: "Connected"
        case .stale: "Verification expired"
        case .partial: "Partially verified"
        case .unavailable: "Unavailable"
        }
    }

    public var systemImage: String {
        switch self {
        case .notRequested: "circle"
        case .awaitingVerification: "clock"
        case .verified: "checkmark.circle.fill"
        case .stale: "clock.badge.exclamationmark"
        case .partial: "exclamationmark.circle"
        case .unavailable: "xmark.circle"
        }
    }

    public var isVerified: Bool {
        if case .verified = self { return true }
        return false
    }

    public var detail: String {
        switch self {
        case .notRequested:
            "This feed is not part of the saved plan."
        case .awaitingVerification:
            "The plan is saved, but no matching fresh receipt exists."
        case .verified(let until):
            "Fresh until \(until.formatted(date: .omitted, time: .shortened))."
        case .stale(let lastVerifiedAt):
            "Last verified \(lastVerifiedAt.formatted(date: .omitted, time: .shortened))."
        case .partial(let reason), .unavailable(let reason):
            reason
        }
    }
}

public struct FeedStateRepository: Sendable {
    public let rootURL: URL

    public init(rootURL: URL) {
        self.rootURL = rootURL.standardizedFileURL
    }

    public static var applicationSupport: FeedStateRepository {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return FeedStateRepository(
            rootURL: base
                .appendingPathComponent("Agents for Introverts", isDirectory: true)
                .appendingPathComponent("Quiet Desk", isDirectory: true)
                .appendingPathComponent("feeds", isDirectory: true)
        )
    }

    public var planURL: URL {
        rootURL.appendingPathComponent("plan.json", isDirectory: false)
    }

    public var receiptsURL: URL {
        rootURL.appendingPathComponent("receipts", isDirectory: true)
    }

    public var insideCuesURL: URL {
        rootURL.appendingPathComponent("inside-cues", isDirectory: true)
    }

    public var outsideCuesURL: URL {
        rootURL.appendingPathComponent("outside-cues", isDirectory: true)
    }

    public func loadPlan() throws -> FeedPlanDocument? {
        guard FileManager.default.fileExists(atPath: planURL.path) else { return nil }
        let document = try FeedStateCoding.decoder.decode(
            FeedPlanDocument.self,
            from: Data(contentsOf: planURL)
        )
        guard document.schema == "afi.feed_plan.v1",
              document.revision > 0,
              document.planHash == (try FeedStateCoding.hash(plans: document.plans))
        else {
            throw FeedRuntimeError.invalidReceipt("The shared feed plan failed its integrity check.")
        }
        return document
    }

    @discardableResult
    public func savePlan(
        _ plans: [FeedConnectionPlan],
        previous: FeedPlanDocument?,
        now: Date
    ) throws -> FeedPlanDocument {
        try prepareDirectories()
        let document = try FeedPlanDocument(
            revision: (previous?.revision ?? 0) + 1,
            updatedAt: now,
            plans: plans
        )
        let data = try FeedStateCoding.encoder.encode(document)
        try data.write(to: planURL, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: planURL.path)
        return document
    }

    public func loadReceipts() throws -> [FeedConnectionReceipt] {
        guard FileManager.default.fileExists(atPath: receiptsURL.path) else { return [] }
        let urls = try FileManager.default.contentsOfDirectory(
            at: receiptsURL,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        )
        return urls
            .filter { $0.pathExtension == "json" }
            .compactMap { try? FeedStateCoding.decoder.decode(FeedConnectionReceipt.self, from: Data(contentsOf: $0)) }
            .sorted { $0.verifiedAt < $1.verifiedAt }
    }

    public func appendReceipt(_ receipt: FeedConnectionReceipt) throws {
        try prepareDirectories()
        guard UUID(uuidString: receipt.id) != nil else {
            throw FeedRuntimeError.invalidReceipt("Receipt ID must be a UUID.")
        }
        let url = receiptsURL.appendingPathComponent("\(receipt.id).json", isDirectory: false)
        let data = try FeedStateCoding.encoder.encode(receipt)
        try data.write(to: url, options: .withoutOverwriting)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    /// Reads only active cues that still match the current user-authored plan
    /// and a receipt that was fresh when the cue was recorded.
    public func loadCues(now: Date) throws -> [FeedCue] {
        guard let document = try loadPlan() else { return [] }
        let receipts = try loadReceipts()
        let receiptsByID = Dictionary(receipts.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let candidates = try [insideCuesURL, outsideCuesURL].flatMap { directory -> [FeedCue] in
            guard FileManager.default.fileExists(atPath: directory.path) else { return [] }
            return try FileManager.default.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            )
            .filter { $0.pathExtension == "json" }
            .compactMap { try? FeedStateCoding.decoder.decode(FeedCue.self, from: Data(contentsOf: $0)) }
        }

        return candidates.filter { cue in
            guard cue.isActive(at: now),
                  let plan = document.plan(for: cue.feedID),
                  let receipt = receiptsByID[cue.receiptID],
                  cue.validationMessage(plan: plan, document: document, receipt: receipt, now: now) == nil
            else { return false }
            let expectedDirectory = cue.boundary == .insideRecall ? insideCuesURL : outsideCuesURL
            return candidatesDirectoryContains(cueID: cue.id, directory: expectedDirectory)
        }
        .sorted { $0.recordedAt > $1.recordedAt }
    }

    public func appendCue(_ cue: FeedCue, now: Date) throws {
        try prepareDirectories()
        guard let document = try loadPlan(),
              let plan = document.plan(for: cue.feedID),
              let receipt = try loadReceipts().first(where: { $0.id == cue.receiptID })
        else { throw FeedRuntimeError.invalidCue("A matching plan and connection receipt are required.") }
        guard receipt.expiresAt > now else {
            throw FeedRuntimeError.invalidCue("The connection receipt expired before the cue was recorded.")
        }
        if let problem = cue.validationMessage(plan: plan, document: document, receipt: receipt, now: now) {
            throw FeedRuntimeError.invalidCue(problem)
        }

        let directory: URL
        switch cue.boundary {
        case .insideRecall:
            directory = insideCuesURL
        case .outsideInput:
            directory = outsideCuesURL
        case .publicOutput:
            throw FeedRuntimeError.invalidCue("Public-output plans cannot write into the cue inbox.")
        }
        let url = directory.appendingPathComponent("\(cue.id).json", isDirectory: false)
        let data = try FeedStateCoding.encoder.encode(cue)
        try data.write(to: url, options: .withoutOverwriting)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    private func candidatesDirectoryContains(cueID: String, directory: URL) -> Bool {
        FileManager.default.fileExists(
            atPath: directory.appendingPathComponent("\(cueID).json", isDirectory: false).path
        )
    }

    private func prepareDirectories() throws {
        for directory in [receiptsURL, insideCuesURL, outsideCuesURL] {
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700]
            )
        }
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: rootURL.path)
        for directory in [receiptsURL, insideCuesURL, outsideCuesURL] {
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
        }
    }
}

public enum FeedRuntimeError: LocalizedError, Equatable {
    case feedNotSelected
    case sharedStateUnavailable
    case computerHistoryUnavailable
    case noCurrentComputerHistorySegment
    case unsafeComputerHistoryPath
    case invalidReceipt(String)
    case invalidCue(String)

    public var errorDescription: String? {
        switch self {
        case .feedNotSelected:
            "Save this feed in the plan before verifying it."
        case .sharedStateUnavailable:
            "The shared feed-state directory is unavailable."
        case .computerHistoryUnavailable:
            "Computer History could not be found on this Mac."
        case .noCurrentComputerHistorySegment:
            "Computer History has no readable segment for the current local day."
        case .unsafeComputerHistoryPath:
            "Computer History metadata pointed outside its own event-stream directory."
        case .invalidReceipt(let reason):
            reason
        case .invalidCue(let reason):
            reason
        }
    }
}

public enum ComputerHistoryFeedAdapter {
    private struct SegmentMetadata: Decodable {
        let eventsPath: String
        let id: String
        let startedAt: Date
    }

    public static func defaultRootCandidates(fileManager: FileManager = .default) -> [URL] {
        let containers = fileManager.homeDirectoryForCurrentUser
            .appendingPathComponent("Library", isDirectory: true)
            .appendingPathComponent("Group Containers", isDirectory: true)

        guard let groups = try? fileManager.contentsOfDirectory(
            at: containers,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else { return [] }

        return groups.compactMap { group in
            let candidate = group
                .appendingPathComponent("Library/Caches/ComputerUse/Skysight", isDirectory: true)
            var isDirectory: ObjCBool = false
            return fileManager.fileExists(atPath: candidate.path, isDirectory: &isDirectory) && isDirectory.boolValue
                ? candidate.standardizedFileURL
                : nil
        }
    }

    public static func verify(
        planDocument: FeedPlanDocument,
        roots: [URL] = defaultRootCandidates(),
        now: Date = Date(),
        calendar: Calendar = .current,
        fileManager: FileManager = .default
    ) throws -> FeedConnectionReceipt {
        guard let plan = planDocument.plan(for: .computerHistoryToday), plan.isEnabled else {
            throw FeedRuntimeError.feedNotSelected
        }
        guard let root = roots.first(where: { candidate in
            var isDirectory: ObjCBool = false
            return fileManager.fileExists(atPath: candidate.path, isDirectory: &isDirectory) && isDirectory.boolValue
        }) else {
            throw FeedRuntimeError.computerHistoryUnavailable
        }

        let segmentsURL = root.appendingPathComponent("segments", isDirectory: true)
        let segmentDirectories = try fileManager.contentsOfDirectory(
            at: segmentsURL,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ).sorted { $0.lastPathComponent > $1.lastPathComponent }

        var selected: (metadata: SegmentMetadata, directory: URL)?
        for directory in segmentDirectories {
            let metadataURL = directory.appendingPathComponent("metadata.json", isDirectory: false)
            guard let data = try? Data(contentsOf: metadataURL),
                  let metadata = try? FeedStateCoding.decoder.decode(SegmentMetadata.self, from: data),
                  calendar.isDate(metadata.startedAt, inSameDayAs: now)
            else { continue }
            selected = (metadata, directory)
            break
        }

        guard let selected else {
            throw FeedRuntimeError.noCurrentComputerHistorySegment
        }

        let eventsURL = URL(fileURLWithPath: selected.metadata.eventsPath).standardizedFileURL
        let rootPrefix = root.standardizedFileURL.path.hasSuffix("/")
            ? root.standardizedFileURL.path
            : root.standardizedFileURL.path + "/"
        guard eventsURL.path.hasPrefix(rootPrefix) else {
            throw FeedRuntimeError.unsafeComputerHistoryPath
        }

        let attributes = try fileManager.attributesOfItem(atPath: eventsURL.path)
        let modifiedAt = attributes[.modificationDate] as? Date ?? selected.metadata.startedAt
        let recent = now.timeIntervalSince(modifiedAt) >= -300 && now.timeIntervalSince(modifiedAt) <= 20 * 60
        let readable = fileManager.isReadableFile(atPath: eventsURL.path)
        let verified = recent && readable
        let checks = [
            FeedConnectionCheck(
                name: "current_local_day",
                passed: true,
                detail: "Found segment \(selected.metadata.id) for today."
            ),
            FeedConnectionCheck(
                name: "segment_readable",
                passed: readable,
                detail: readable ? "The event stream is readable." : "The event stream is not readable."
            ),
            FeedConnectionCheck(
                name: "recent_segment",
                passed: recent,
                detail: recent ? "The segment changed recently." : "The latest segment is not recent."
            ),
        ]

        return FeedConnectionReceipt(
            feedID: .computerHistoryToday,
            planRevision: planDocument.revision,
            planHash: planDocument.planHash,
            adapter: "computer-history.local-segments.v1",
            expectedIdentity: "",
            observedIdentity: nil,
            permission: plan.permission,
            scope: plan.id.authorizedScope,
            status: verified ? .verified : .partial,
            verifiedAt: now,
            expiresAt: now.addingTimeInterval(15 * 60),
            lastSuccessfulReadAt: readable ? now : nil,
            checks: checks,
            summary: verified
                ? "Current-day Computer History is readable. No activity content was retained."
                : "Computer History was found, but its current-day stream was not fully verified.",
        )
    }
}

enum FeedStateCoding {
    static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return encoder
    }

    static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    static func hash(plans: [FeedConnectionPlan]) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let digest = SHA256.hash(data: try encoder.encode(plans))
        return "sha256:" + digest.map { String(format: "%02x", $0) }.joined()
    }
}
