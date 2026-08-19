import Foundation

public enum FixtureLoadError: LocalizedError, Equatable {
    case missingResource
    case fixturesMustBeSynthetic
    case externalActionNotApprovalGated(UUID)

    public var errorDescription: String? {
        switch self {
        case .missingResource:
            "The bundled synthetic fixture file is missing."
        case .fixturesMustBeSynthetic:
            "Quiet Desk refuses to load bundled data that is not marked synthetic."
        case .externalActionNotApprovalGated(let itemID):
            "External action \(itemID) is not explicitly approval-gated."
        }
    }
}

public enum QuietDeskFixtureLoader {
    public static func load() throws -> QuietDeskSnapshot {
        let url = Bundle.main.url(forResource: "synthetic-feed", withExtension: "json")
            ?? Bundle.module.url(forResource: "synthetic-feed", withExtension: "json")
        guard let url else {
            throw FixtureLoadError.missingResource
        }

        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let snapshot = try decoder.decode(QuietDeskSnapshot.self, from: data)

        guard snapshot.isSynthetic else {
            throw FixtureLoadError.fixturesMustBeSynthetic
        }

        if let violation = snapshot.approvalPolicyViolations.first {
            throw FixtureLoadError.externalActionNotApprovalGated(violation)
        }

        return snapshot
    }
}
