import XCTest
@testable import QuietDeskCore

final class SourceURLTests: XCTestCase {
    func testHTTPAndHTTPSSourcesAreUserOpenable() {
        XCTAssertEqual(claim(sourceURL: "https://example.invalid/source").userOpenableSourceURL?.scheme, "https")
        XCTAssertEqual(claim(sourceURL: "http://example.invalid/source").userOpenableSourceURL?.scheme, "http")
    }

    func testNonWebAndMalformedSourcesAreNotUserOpenable() {
        XCTAssertNil(claim(sourceURL: "file:///tmp/private.txt").userOpenableSourceURL)
        XCTAssertNil(claim(sourceURL: "javascript:alert(1)").userOpenableSourceURL)
        XCTAssertNil(claim(sourceURL: "not a url").userOpenableSourceURL)
        XCTAssertNil(claim(sourceURL: "https://").userOpenableSourceURL)
        XCTAssertNil(claim(sourceURL: "https:///missing-host").userOpenableSourceURL)
    }

    private func claim(sourceURL: String) -> EvidenceClaim {
        EvidenceClaim(
            id: UUID(uuidString: "aaaaaaaa-0000-0000-0000-000000000003")!,
            claim: "Synthetic claim",
            kind: .direct,
            sourceID: UUID(uuidString: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")!,
            sourceTitle: "Synthetic source",
            sourceURL: sourceURL,
            sourceCapturedAt: Date(timeIntervalSince1970: 0),
            excerpt: "Synthetic excerpt"
        )
    }
}
