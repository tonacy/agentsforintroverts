import Foundation

/// The JSON the local runner prints. Keys arrive in snake_case except where
/// the runner already used camelCase (`runId`, `exitCode`); the shared decoder
/// handles both, so these types stay plain.
public enum RunnerJSON {
    public static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: raw) { return date }
            let plain = ISO8601DateFormatter()
            if let date = plain.date(from: raw) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Not an ISO 8601 date: \(raw)")
        }
        return decoder
    }()

    public static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        try decoder.decode(type, from: data)
    }
}

public enum ProviderKind: String, Codable, Hashable, Sendable {
    case harness
    case sdk
    case fixture
}

/// What the app can honestly say about a provider before trying it.
public enum ProviderAvailability: String, Hashable, Sendable {
    case signedIn
    case notSignedIn
    case notInstalled
    case unknown

    public var label: String {
        switch self {
        case .signedIn: "Signed in"
        case .notSignedIn: "Not signed in"
        case .notInstalled: "Not installed"
        case .unknown: "Unknown"
        }
    }
}

public struct ProviderModelChoice: Codable, Hashable, Sendable, Identifiable {
    /// `nil` means the provider's own default.
    public let id: String?
    public let label: String

    public init(id: String?, label: String) {
        self.id = id
        self.label = label
    }

    /// A stable, non-optional key for pickers.
    public var key: String { id ?? "" }
}

public struct ProviderDescriptor: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let label: String
    public let kind: ProviderKind
    public let installed: Bool
    public let path: String?
    public let version: String?
    /// `nil` means the runner could not tell.
    public let signedIn: Bool?
    public let signInHint: String?
    public let models: [ProviderModelChoice]

    public init(
        id: String,
        label: String,
        kind: ProviderKind,
        installed: Bool,
        path: String?,
        version: String?,
        signedIn: Bool?,
        signInHint: String?,
        models: [ProviderModelChoice]
    ) {
        self.id = id
        self.label = label
        self.kind = kind
        self.installed = installed
        self.path = path
        self.version = version
        self.signedIn = signedIn
        self.signInHint = signInHint
        self.models = models
    }

    public var availability: ProviderAvailability {
        guard installed else { return .notInstalled }
        switch signedIn {
        case .some(true): return .signedIn
        case .some(false): return .notSignedIn
        case .none: return .unknown
        }
    }

    /// An unknown sign-in state is not a reason to refuse; the runner reports
    /// the real failure if there is one.
    public var canRun: Bool {
        installed && signedIn != false
    }

    public var systemImage: String {
        switch kind {
        case .harness: "terminal"
        case .sdk: "key"
        case .fixture: "testtube.2"
        }
    }

    public var summary: String {
        switch id {
        case "claude":
            "Claude Code, the terminal harness you already sign in to. Quiet Desk runs the daily-conversation role through it, with no tools and no session saved."
        case "codex":
            "Codex CLI, run non-interactively in a read-only sandbox with its own login."
        case "anthropic":
            "A direct Anthropic account through an `ant auth login` profile or an API key in the shell you launch the app from. Nothing is stored here."
        case "fixture":
            "A canned, offline day. It exercises the whole loop without a network or a login, but its text does not describe the sources it cites."
        default:
            label
        }
    }
}

public struct ProviderCatalog: Codable, Hashable, Sendable {
    public let schema: String
    public let checkedAt: Date
    public let preferred: String?
    public let providers: [ProviderDescriptor]

    public init(schema: String, checkedAt: Date, preferred: String?, providers: [ProviderDescriptor]) {
        self.schema = schema
        self.checkedAt = checkedAt
        self.preferred = preferred
        self.providers = providers
    }

    public var preferredProvider: ProviderDescriptor? {
        guard let preferred else { return nil }
        return providers.first { $0.id == preferred }
    }

    public func provider(id: String?) -> ProviderDescriptor? {
        guard let id else { return nil }
        return providers.first { $0.id == id }
    }
}

public struct ProviderPreference: Codable, Hashable, Sendable {
    public let schema: String?
    public let provider: String
    public let model: String?
    public let chosenAt: Date?

    public init(schema: String? = nil, provider: String, model: String?, chosenAt: Date? = nil) {
        self.schema = schema
        self.provider = provider
        self.model = model
        self.chosenAt = chosenAt
    }
}

public enum RunOutcome: String, Codable, Hashable, Sendable {
    case completed
    case partial
    case failed

    public var label: String {
        switch self {
        case .completed: "Completed"
        case .partial: "Partial"
        case .failed: "Failed"
        }
    }
}

public struct RunRecordSummary: Codable, Hashable, Sendable {
    public let runId: String
    public let status: RunOutcome
    public let provider: String
    public let model: String?
    public let startedAt: Date?
    public let finishedAt: Date?
    public let blockers: [String]
    public let notes: [String]
}

public struct DayStatus: Codable, Hashable, Sendable {
    public struct Capture: Codable, Hashable, Sendable {
        public let exists: Bool
        public let path: String?
        public let authorHuman: Bool?
    }

    public struct Sources: Codable, Hashable, Sendable {
        public let verifiedInWindow: Int
        public let windowDays: Int
        public let lastCollectedAt: Date?
    }

    public struct Conversation: Codable, Hashable, Sendable {
        public let exists: Bool
        public let path: String?
        public let places: Int
        public let developments: Int
        public let publicExported: Bool
        public let publicPath: String?
    }

    public let schema: String
    public let date: String
    public let weekday: String
    public let capture: Capture
    public let sources: Sources
    public let latestRun: RunRecordSummary?
    public let conversation: Conversation
    public let providerPreference: ProviderPreference?
    public let publicTopics: String?
}

public struct RunDayResult: Codable, Hashable, Sendable {
    public let status: RunOutcome
    public let exitCode: Int
    public let runId: String
    public let blockers: [String]
    public let notes: [String]
}

public struct ExportResult: Codable, Hashable, Sendable {
    public let path: String
    public let out: String?
}

public struct CollectResult: Codable, Hashable, Sendable {
    public struct Failure: Codable, Hashable, Sendable {
        public let url: String
        public let message: String
        private enum CodingKeys: String, CodingKey { case url, message, error }
        public init(from decoder: Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            url = try values.decode(String.self, forKey: .url)
            message = try values.decodeIfPresent(String.self, forKey: .error) ?? values.decode(String.self, forKey: .message)
        }
        public func encode(to encoder: Encoder) throws {
            var values = encoder.container(keyedBy: CodingKeys.self)
            try values.encode(url, forKey: .url); try values.encode(message, forKey: .error)
        }
    }
    public let written: Int
    public let skipped: Int
    public let errors: [Failure]
    private enum CodingKeys: String, CodingKey { case written, skipped, errors }
    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        written = try (try? values.decode(Int.self, forKey: .written)) ?? (try values.decode([String].self, forKey: .written)).count
        skipped = try (try? values.decode(Int.self, forKey: .skipped)) ?? (try values.decode([String].self, forKey: .skipped)).count
        errors = try values.decode([Failure].self, forKey: .errors)
    }
}

public struct CaptureResult: Codable, Hashable, Sendable {
    public let path: String
    public let created: Bool
}

/// Blocker codes from the runner, said plainly.
public enum RunBlocker {
    public static func explanation(for code: String) -> String {
        switch code {
        case "provider_reported_partial":
            "The provider could not finish. See the reason below."
        case "reviewed_recall_changed":
            "The recap changed after review. Restore the reviewed recap before running."
        case "capture_missing":
            "There is no capture for today yet. Write one in your own words first."
        case "capture_not_human_authored":
            "Today's capture is not marked as written by you. Only a human capture can start a conversation."
        case "outside_context_not_ready":
            "Fewer than two verified public sources were collected in the window. Collect first."
        case "provider_error":
            "The provider could not be reached or returned an error. Check its sign-in and try again."
        case "provider_stop_refusal":
            "The provider declined this request. Nothing was written."
        case "provider_stop_max_tokens":
            "The provider ran out of room before finishing. Try again, or a shorter mode."
        case "provider_output_unparseable":
            "The provider answered, but not in the agreed shape. Nothing was written."
        case "no_source_backed_claims":
            "Every claim cited an unknown source and was dropped. Nothing source-backed survived."
        default:
            "The run stopped: \(code)."
        }
    }
}

public struct CheckInRecap: Codable, Hashable, Sendable {
    public let date: String
    public let recap: String
    public let coverage: String
    public let evidence: [String]
    public let question: String
    public let revision: String
    public let useHistory: Bool
}

public struct CompanionState: Decodable, Sendable {
    public let threadId: String?
    public let revision: String
    public let summary: String?
    public let openQuestions: [String]
    public let updatedAt: Date?
    public let syncedAt: Date?
    public let syncError: String?
    public let url: String?
    public let updates: [CompanionUpdate]
    public let workItems: [CompanionWorkItem]?
    public let latestDecision: CompanionDecision?
}

public struct CompanionUpdate: Decodable, Identifiable, Sendable {
    public var id: String { revision }
    public let revision: String
    public let reason: String
    public let createdAt: Date
}

/// An explicit agent-authored projection, never inferred from summary keywords.
public struct CompanionWorkItem: Decodable, Identifiable, Sendable {
    public let id: String
    public let project: String
    public let title: String
    public let state: String
    public let preview: [CompanionPreviewBlock]
    public let notes: String
    public let evidence: String
    public let messageIds: [String]
    public let sources: [CompanionWorkSource]
    public let imagePath: String?
}

public struct CompanionPreviewBlock: Decodable, Sendable {
    public let heading: String
    public let text: String
}

public struct CompanionDecision: Decodable, Sendable {
    public let text: String
    public let workItemId: String
}

public struct CompanionWorkSource: Decodable, Sendable {
    public let label: String
    public let path: String?
    public let url: String?

    public init(label: String, path: String?, url: String?) {
        self.label = label; self.path = path; self.url = url
    }

    /// Never execute a stored URL scheme or follow a file outside this Desk.
    public func destination(workspace: String) -> URL? {
        if let path {
            guard !path.hasPrefix("/") else { return nil }
            let root = URL(fileURLWithPath: workspace).resolvingSymlinksInPath()
            let file = root.appendingPathComponent(path).standardizedFileURL.resolvingSymlinksInPath()
            guard file.path.hasPrefix(root.path + "/"), FileManager.default.fileExists(atPath: file.path) else { return nil }
            return file
        }
        guard let url, let value = URL(string: url), value.scheme == "https", value.host != nil,
              value.user == nil, value.password == nil else { return nil }
        return value
    }
}
