import Foundation

public struct QuietDeskClient: Sendable {
    public var loadSnapshot: @Sendable (_ hubBaseURL: URL?) async throws -> QuietDeskSnapshot

    public init(
        loadSnapshot: @escaping @Sendable (_ hubBaseURL: URL?) async throws -> QuietDeskSnapshot
    ) {
        self.loadSnapshot = loadSnapshot
    }
}

public extension QuietDeskClient {
    static let bundledSyntheticFixtures = QuietDeskClient { _ in
        try QuietDeskFixtureLoader.load()
    }

    static func failing(message: String) -> QuietDeskClient {
        QuietDeskClient { _ in
            throw PreviewClientError(message: message)
        }
    }
}

public struct PreviewClientError: LocalizedError, Sendable {
    public let message: String

    public var errorDescription: String? { message }
}
