import XCTest
@testable import QuietDeskCore

final class CalmInformationArchitectureTests: XCTestCase {
    func testDefaultDestinationIsNowAndTopLevelHasOnlyThreeChoices() {
        XCTAssertEqual(QuietDeskDestination.initial, .now)
        XCTAssertEqual(QuietDeskDestination.allCases, [.now, .activity, .connections])

        let titles = QuietDeskDestination.allCases.map(\.title)
        XCTAssertEqual(Set(titles).count, titles.count)
        XCTAssertTrue(titles.allSatisfy { $0.split(separator: " ").count <= 3 })
    }

    func testDefaultSurfaceAdmitsOnlyItemsThatNeedThePerson() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let attention = snapshot.attentionItems()

        XCTAssertEqual(attention.count, 1)
        XCTAssertTrue(attention.allSatisfy { $0.status == .needsYou })
        XCTAssertFalse(attention.contains { $0.proofLedger.contains(.approved) })
        XCTAssertFalse(attention.contains { $0.status == .watching || $0.status == .handled })
    }

    func testOperationalStatesRemainAvailableOneLevelDeeper() throws {
        let snapshot = try QuietDeskFixtureLoader.load()

        XCTAssertEqual(snapshot.activityItems(for: .needsYou).count, 1)
        XCTAssertEqual(snapshot.activityItems(for: .open).count, 6)
        XCTAssertEqual(snapshot.activityItems(for: .watching).count, 3)
        XCTAssertEqual(snapshot.activityItems(for: .handled).count, 1)
        XCTAssertEqual(snapshot.activityItems(for: .all).count, 7)
    }

    func testDefaultSurfaceNeverShowsMoreThanThreeItems() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let attentionItem = try XCTUnwrap(snapshot.attentionItems().first)
        let crowdedSnapshot = QuietDeskSnapshot(
            generatedAt: snapshot.generatedAt,
            isSynthetic: true,
            items: Array(repeating: attentionItem, count: 8),
            agents: snapshot.agents,
            sources: snapshot.sources
        )

        XCTAssertEqual(QuietDeskPresentationPolicy.maximumTopLevelAttentionItems, 3)
        XCTAssertEqual(crowdedSnapshot.attentionItems().count, 8)
        XCTAssertEqual(crowdedSnapshot.topLevelAttentionItems().count, 3)
    }

    func testActivitySearchRetainsSourceAndPayloadProvenance() throws {
        let snapshot = try QuietDeskFixtureLoader.load()

        XCTAssertFalse(snapshot.activityItems(for: .all, query: "Synthetic Calendar").isEmpty)
        XCTAssertEqual(snapshot.activityItems(for: .open, query: "Thursday morning").count, 1)
    }
}
