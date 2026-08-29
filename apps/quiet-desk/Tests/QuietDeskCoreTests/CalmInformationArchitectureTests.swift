import XCTest
@testable import QuietDeskCore

final class CalmInformationArchitectureTests: XCTestCase {
    func testDefaultDestinationIsDailyConversationAndTopLevelHasOnlyThreeChoices() {
        XCTAssertEqual(QuietDeskDestination.initial, .conversation)
        XCTAssertEqual(QuietDeskDestination.allCases, [.conversation, .activity, .connections])

        let titles = QuietDeskDestination.allCases.map(\.title)
        XCTAssertEqual(Set(titles).count, titles.count)
        XCTAssertTrue(titles.allSatisfy { $0.split(separator: " ").count <= 3 })
    }

    func testDailyConversationAdmitsOnlyAFewSupportingHumanThreads() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let threads = snapshot.topLevelThreads()

        XCTAssertEqual(threads.count, 2)
        XCTAssertTrue(threads.allSatisfy { !$0.claims.isEmpty })
        XCTAssertTrue(threads.allSatisfy { !$0.contextStatementIDs.isEmpty })
        XCTAssertTrue(threads.allSatisfy { (1...3).contains($0.people.count) })
        XCTAssertEqual(snapshot.threadReferenceViolations, [])
    }

    func testSourceActivityAndApprovalStatesRemainAvailableOneLevelDeeper() throws {
        let snapshot = try QuietDeskFixtureLoader.load()

        XCTAssertEqual(snapshot.activityItems(for: .needsYou).count, 2)
        XCTAssertEqual(snapshot.activityItems(for: .open).count, 7)
        XCTAssertEqual(snapshot.activityItems(for: .watching).count, 3)
        XCTAssertEqual(snapshot.activityItems(for: .handled).count, 1)
        XCTAssertEqual(snapshot.activityItems(for: .all).count, 8)
    }

    func testSupportingSurfaceNeverShowsMoreThanThreeThreads() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let thread = try XCTUnwrap(snapshot.threads.first)
        let crowdedSnapshot = QuietDeskSnapshot(
            generatedAt: snapshot.generatedAt,
            isSynthetic: true,
            items: snapshot.items,
            agents: snapshot.agents,
            sources: snapshot.sources,
            personalContext: snapshot.personalContext,
            threads: Array(repeating: thread, count: 8)
        )

        XCTAssertEqual(QuietDeskPresentationPolicy.maximumTopLevelThreads, 3)
        XCTAssertEqual(crowdedSnapshot.conversationThreads().count, 8)
        XCTAssertEqual(crowdedSnapshot.topLevelThreads().count, 3)
    }

    func testActivitySearchRetainsSourceAndPayloadProvenance() throws {
        let snapshot = try QuietDeskFixtureLoader.load()

        XCTAssertFalse(snapshot.activityItems(for: .all, query: "Synthetic Calendar").isEmpty)
        XCTAssertEqual(snapshot.activityItems(for: .open, query: "Thursday morning").count, 1)
    }
}
