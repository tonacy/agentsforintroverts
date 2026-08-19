import XCTest
@testable import QuietDeskCore

final class FilteringTests: XCTestCase {
    func testSidebarFiltersRemainSemanticallyDistinct() throws {
        let snapshot = try QuietDeskFixtureLoader.load()

        XCTAssertEqual(snapshot.filteredItems(for: .needsYou).count, 2)
        XCTAssertEqual(snapshot.filteredItems(for: .watching).count, 3)
        XCTAssertEqual(snapshot.filteredItems(for: .handled).count, 1)
        XCTAssertEqual(snapshot.filteredItems(for: .slowFeed).count, 6)
        XCTAssertEqual(snapshot.filteredItems(for: .today).count, 6)
        XCTAssertTrue(snapshot.filteredItems(for: .slowFeed).allSatisfy { $0.status != .handled })
    }

    func testSearchCoversAgentProviderSourceAndExactPayload() throws {
        let snapshot = try QuietDeskFixtureLoader.load()

        XCTAssertFalse(snapshot.filteredItems(for: .slowFeed, query: "Grok Bot").isEmpty)
        XCTAssertFalse(snapshot.filteredItems(for: .slowFeed, query: "Synthetic Calendar").isEmpty)
        XCTAssertEqual(snapshot.filteredItems(for: .needsYou, query: "Thursday morning").count, 1)
        XCTAssertEqual(snapshot.filteredItems(for: .slowFeed, query: "does-not-exist").count, 0)
    }
}
