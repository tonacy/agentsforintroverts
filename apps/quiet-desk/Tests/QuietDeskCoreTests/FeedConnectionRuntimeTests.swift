import Foundation
import XCTest
@testable import QuietDeskCore

@MainActor
final class FeedConnectionRuntimeTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_788_543_600) // 2026-09-04T17:40:00Z

    func testSharedPlanIsRevisionedAndReadableAcrossProcesses() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let repository = FeedStateRepository(rootURL: root)

        var plans = FeedConnectionPlan.defaults
        let xIndex = plans.firstIndex { $0.id == .xFollowing }!
        plans[xIndex].isEnabled = true
        plans[xIndex].accountIdentifier = "@tonylongname"

        let first = try repository.savePlan(plans, previous: nil, now: now)
        let second = try repository.savePlan(plans, previous: first, now: now.addingTimeInterval(60))

        XCTAssertEqual(first.schema, "afi.feed_plan.v1")
        XCTAssertEqual(first.revision, 1)
        XCTAssertEqual(second.revision, 2)
        XCTAssertEqual(try repository.loadPlan(), second)
        XCTAssertTrue(second.planHash.hasPrefix("sha256:"))
        XCTAssertEqual(second.planHash.count, 71)
    }

    func testSharedPlanFailsClosedWhenRowsChangeWithoutANewHash() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let repository = FeedStateRepository(rootURL: root)
        let document = try repository.savePlan(computerHistoryPlans(), previous: nil, now: now)
        let data = try Data(contentsOf: repository.planURL)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        var plans = try XCTUnwrap(object["plans"] as? [[String: Any]])
        let index = try XCTUnwrap(plans.firstIndex { $0["id"] as? String == "x_following" })
        plans[index]["accountIdentifier"] = "@thepeptideapp"
        object["plans"] = plans
        object["planHash"] = document.planHash
        try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
            .write(to: repository.planURL, options: .atomic)

        XCTAssertThrowsError(try repository.loadPlan())
    }

    func testComputerHistoryVerificationReadsOnlyCurrentSegmentMetadata() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let events = try makeComputerHistorySegment(root: root, startedAt: now.addingTimeInterval(-60))
        try FileManager.default.setAttributes([.modificationDate: now], ofItemAtPath: events.path)

        let document = try computerHistoryPlan()
        let receipt = try ComputerHistoryFeedAdapter.verify(
            planDocument: document,
            roots: [root],
            now: now,
            calendar: utcCalendar
        )

        XCTAssertEqual(receipt.feedID, .computerHistoryToday)
        XCTAssertEqual(receipt.status, .verified)
        XCTAssertTrue(receipt.allChecksPassed)
        XCTAssertNil(receipt.observedIdentity)
        XCTAssertEqual(receipt.expiresAt.timeIntervalSince(receipt.verifiedAt), 15 * 60)
        XCTAssertTrue(receipt.summary.contains("No activity content was retained"))
    }

    func testComputerHistoryVerificationRejectsEarlierDayAndEscapedEventPath() throws {
        let staleRoot = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: staleRoot) }
        _ = try makeComputerHistorySegment(root: staleRoot, startedAt: now.addingTimeInterval(-25 * 60 * 60))
        XCTAssertThrowsError(
            try ComputerHistoryFeedAdapter.verify(
                planDocument: computerHistoryPlan(),
                roots: [staleRoot],
                now: now,
                calendar: utcCalendar
            )
        ) { error in
            XCTAssertEqual(error as? FeedRuntimeError, .noCurrentComputerHistorySegment)
        }

        let escapedRoot = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: escapedRoot) }
        let external = temporaryRoot().appendingPathComponent("events.jsonl")
        defer { try? FileManager.default.removeItem(at: external.deletingLastPathComponent()) }
        try FileManager.default.createDirectory(at: external.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("{}\n".utf8).write(to: external)
        try makeComputerHistoryMetadata(root: escapedRoot, startedAt: now, eventsPath: external.path)

        XCTAssertThrowsError(
            try ComputerHistoryFeedAdapter.verify(
                planDocument: computerHistoryPlan(),
                roots: [escapedRoot],
                now: now,
                calendar: utcCalendar
            )
        ) { error in
            XCTAssertEqual(error as? FeedRuntimeError, .unsafeComputerHistoryPath)
        }
    }

    func testStoreSurfacesOnlyFreshReceiptsForTheExactPlanRevision() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let repository = FeedStateRepository(rootURL: root)
        let document = try repository.savePlan(
            computerHistoryPlans(),
            previous: nil,
            now: now
        )
        let receipt = FeedConnectionReceipt(
            feedID: .computerHistoryToday,
            planRevision: document.revision,
            planHash: document.planHash,
            adapter: "computer-history.local-segments.v1",
            expectedIdentity: "",
            observedIdentity: nil,
            permission: .readOnly,
            scope: FeedConnectionID.computerHistoryToday.authorizedScope,
            status: .verified,
            verifiedAt: now,
            expiresAt: now.addingTimeInterval(900),
            lastSuccessfulReadAt: now,
            checks: [
                FeedConnectionCheck(name: "current_local_day", passed: true, detail: "Today."),
                FeedConnectionCheck(name: "segment_readable", passed: true, detail: "Readable."),
                FeedConnectionCheck(name: "recent_segment", passed: true, detail: "Recent."),
            ],
            summary: "Verified current-day local access."
        )
        try repository.appendReceipt(receipt)

        let freshNow = now.addingTimeInterval(60)
        let store = QuietDeskStore(
            client: .bundledSyntheticFixtures,
            feedStateRepository: repository,
            now: { freshNow }
        )
        XCTAssertTrue(store.feedConnectionPhase(for: .computerHistoryToday).isVerified)

        let expiredNow = now.addingTimeInterval(1_000)
        let staleStore = QuietDeskStore(
            client: .bundledSyntheticFixtures,
            feedStateRepository: repository,
            now: { expiredNow }
        )
        if case .stale = staleStore.feedConnectionPhase(for: .computerHistoryToday) {
            // Expected.
        } else {
            XCTFail("Expected an expired receipt to become stale")
        }
    }

    func testCuesStayCreateOnlyAndPhysicallyPartitioned() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let repository = FeedStateRepository(rootURL: root)
        let document = try repository.savePlan(bothSourcePlans(), previous: nil, now: now)
        let xReceipt = verifiedReceipt(for: .xFollowing, document: document)
        let historyReceipt = verifiedReceipt(for: .computerHistoryToday, document: document)
        try repository.appendReceipt(xReceipt)
        try repository.appendReceipt(historyReceipt)

        let outside = FeedCue(
            feedID: .xFollowing,
            boundary: .outsideInput,
            planRevision: document.revision,
            planHash: document.planHash,
            receiptID: xReceipt.id,
            minimizedCue: "Two views of agent orchestration may be worth discussing.",
            observedAt: now,
            recordedAt: now,
            expiresAt: now.addingTimeInterval(6 * 60 * 60),
            sourceDoors: [URL(string: "https://x.com/example/status/1")!]
        )
        let inside = FeedCue(
            feedID: .computerHistoryToday,
            boundary: .insideRecall,
            planRevision: document.revision,
            planHash: document.planHash,
            receiptID: historyReceipt.id,
            minimizedCue: "It may have been a fragmented day across several work surfaces.",
            observedAt: now,
            recordedAt: now,
            expiresAt: now.addingTimeInterval(6 * 60 * 60)
        )
        try repository.appendCue(outside, now: now)
        try repository.appendCue(inside, now: now)

        XCTAssertTrue(FileManager.default.fileExists(
            atPath: repository.outsideCuesURL.appendingPathComponent("\(outside.id).json").path
        ))
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: repository.insideCuesURL.appendingPathComponent("\(inside.id).json").path
        ))
        XCTAssertEqual(try repository.loadCues(now: now.addingTimeInterval(60)).count, 2)
        XCTAssertThrowsError(try repository.appendCue(outside, now: now))
    }

    func testCueValidationRejectsBoundaryCrossingAndPrivateSourceDoors() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let repository = FeedStateRepository(rootURL: root)
        let document = try repository.savePlan(bothSourcePlans(), previous: nil, now: now)
        let xReceipt = verifiedReceipt(for: .xFollowing, document: document)
        let historyReceipt = verifiedReceipt(for: .computerHistoryToday, document: document)
        try repository.appendReceipt(xReceipt)
        try repository.appendReceipt(historyReceipt)

        let crossed = FeedCue(
            feedID: .xFollowing,
            boundary: .insideRecall,
            planRevision: document.revision,
            planHash: document.planHash,
            receiptID: xReceipt.id,
            minimizedCue: "This must not cross the boundary.",
            observedAt: now,
            recordedAt: now,
            expiresAt: now.addingTimeInterval(60),
            sourceDoors: [URL(string: "https://x.com/example/status/1")!]
        )
        XCTAssertThrowsError(try repository.appendCue(crossed, now: now))

        let privateLocator = FeedCue(
            feedID: .computerHistoryToday,
            boundary: .insideRecall,
            planRevision: document.revision,
            planHash: document.planHash,
            receiptID: historyReceipt.id,
            minimizedCue: "A private locator must not escape.",
            observedAt: now,
            recordedAt: now,
            expiresAt: now.addingTimeInterval(60),
            sourceDoors: [URL(fileURLWithPath: "/private/history/events.jsonl")]
        )
        XCTAssertThrowsError(try repository.appendCue(privateLocator, now: now))
    }

    func testExpiredAndMisplacedCuesDoNotEnterTheProjection() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let repository = FeedStateRepository(rootURL: root)
        let document = try repository.savePlan(bothSourcePlans(), previous: nil, now: now)
        let receipt = verifiedReceipt(for: .xFollowing, document: document)
        try repository.appendReceipt(receipt)
        let cue = FeedCue(
            feedID: .xFollowing,
            boundary: .outsideInput,
            planRevision: document.revision,
            planHash: document.planHash,
            receiptID: receipt.id,
            minimizedCue: "This cue should expire.",
            observedAt: now,
            recordedAt: now,
            expiresAt: now.addingTimeInterval(60),
            sourceDoors: [URL(string: "https://x.com/example/status/1")!]
        )
        try repository.appendCue(cue, now: now)
        XCTAssertTrue(try repository.loadCues(now: now.addingTimeInterval(120)).isEmpty)

        let misplaced = FeedCue(
            feedID: .xFollowing,
            boundary: .outsideInput,
            planRevision: document.revision,
            planHash: document.planHash,
            receiptID: receipt.id,
            minimizedCue: "A misplaced cue must fail closed.",
            observedAt: now,
            recordedAt: now,
            expiresAt: now.addingTimeInterval(600),
            sourceDoors: [URL(string: "https://x.com/example/status/2")!]
        )
        try FileManager.default.createDirectory(at: repository.insideCuesURL, withIntermediateDirectories: true)
        try FeedStateCoding.encoder.encode(misplaced).write(
            to: repository.insideCuesURL.appendingPathComponent("\(misplaced.id).json")
        )
        XCTAssertFalse(try repository.loadCues(now: now).contains { $0.id == misplaced.id })
    }

    func testEveryCueRequiresUncertaintyAndCalibrationOnAppendAndReload() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let repository = FeedStateRepository(rootURL: root)
        let document = try repository.savePlan(bothSourcePlans(), previous: nil, now: now)
        var validIDs = Set<String>()

        for feedID in [FeedConnectionID.xFollowing, .computerHistoryToday] {
            let receipt = verifiedReceipt(for: feedID, document: document)
            try repository.appendReceipt(receipt)
            let isOutside = feedID == .xFollowing
            let directory = isOutside ? repository.outsideCuesURL : repository.insideCuesURL

            for (uncertain, requiresCalibration) in [(true, true), (false, true), (true, false), (false, false)] {
                let cue = FeedCue(
                    feedID: feedID,
                    boundary: isOutside ? .outsideInput : .insideRecall,
                    planRevision: document.revision,
                    planHash: document.planHash,
                    receiptID: receipt.id,
                    minimizedCue: "A source observation needs the person's interpretation.",
                    observedAt: now,
                    recordedAt: now,
                    expiresAt: now.addingTimeInterval(600),
                    sourceDoors: isOutside ? [URL(string: "https://x.com/example/status/1")!] : [],
                    uncertain: uncertain,
                    requiresCalibration: requiresCalibration
                )

                if uncertain && requiresCalibration {
                    try repository.appendCue(cue, now: now)
                    validIDs.insert(cue.id)
                } else {
                    XCTAssertThrowsError(
                        try repository.appendCue(cue, now: now),
                        "\(feedID) must reject uncertainty=\(uncertain), calibration=\(requiresCalibration)"
                    )
                    // A separate local writer must not bypass the same boundary on reload.
                    try FeedStateCoding.encoder.encode(cue).write(
                        to: directory.appendingPathComponent("\(cue.id).json")
                    )
                }
            }
        }

        let reopenedRepository = FeedStateRepository(rootURL: root)
        XCTAssertEqual(Set(try reopenedRepository.loadCues(now: now).map(\.id)), validIDs)
        let checkTime = now
        let store = QuietDeskStore(
            client: .bundledSyntheticFixtures,
            feedStateRepository: reopenedRepository,
            now: { checkTime }
        )
        XCTAssertEqual(Set(store.feedCues.map(\.id)), validIDs)
    }

    private var utcCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private func computerHistoryPlans() -> [FeedConnectionPlan] {
        var plans = FeedConnectionPlan.defaults
        let index = plans.firstIndex { $0.id == .computerHistoryToday }!
        plans[index].isEnabled = true
        return plans
    }

    private func bothSourcePlans() -> [FeedConnectionPlan] {
        var plans = FeedConnectionPlan.defaults
        let xIndex = plans.firstIndex { $0.id == .xFollowing }!
        plans[xIndex].isEnabled = true
        plans[xIndex].accountIdentifier = "@tonylongname"
        let historyIndex = plans.firstIndex { $0.id == .computerHistoryToday }!
        plans[historyIndex].isEnabled = true
        return plans
    }

    private func verifiedReceipt(
        for id: FeedConnectionID,
        document: FeedPlanDocument
    ) -> FeedConnectionReceipt {
        let isX = id == .xFollowing
        return FeedConnectionReceipt(
            feedID: id,
            planRevision: document.revision,
            planHash: document.planHash,
            adapter: isX ? "x.safari-following.v1" : "computer-history.local-segments.v1",
            expectedIdentity: isX ? "@tonylongname" : "",
            observedIdentity: isX ? "@tonylongname" : nil,
            permission: .readOnly,
            scope: id.authorizedScope,
            status: .verified,
            verifiedAt: now,
            expiresAt: now.addingTimeInterval(id.maximumReceiptLifetime),
            lastSuccessfulReadAt: now,
            checks: isX ? [
                FeedConnectionCheck(name: "account_visible", passed: true, detail: "Visible."),
                FeedConnectionCheck(name: "account_matches", passed: true, detail: "Matched."),
                FeedConnectionCheck(name: "following_selected", passed: true, detail: "Selected."),
                FeedConnectionCheck(name: "bounded_read_completed", passed: true, detail: "Read."),
            ] : [
                FeedConnectionCheck(name: "current_local_day", passed: true, detail: "Today."),
                FeedConnectionCheck(name: "segment_readable", passed: true, detail: "Readable."),
                FeedConnectionCheck(name: "recent_segment", passed: true, detail: "Recent."),
            ],
            summary: "Verified for cue tests."
        )
    }

    private func computerHistoryPlan() throws -> FeedPlanDocument {
        try FeedPlanDocument(revision: 1, updatedAt: now, plans: computerHistoryPlans())
    }

    private func temporaryRoot() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("QuietDeskFeedTests-\(UUID().uuidString)", isDirectory: true)
    }

    @discardableResult
    private func makeComputerHistorySegment(root: URL, startedAt: Date) throws -> URL {
        let events = root
            .appendingPathComponent("segments", isDirectory: true)
            .appendingPathComponent("2026-09-04T17-39-00Z", isDirectory: true)
            .appendingPathComponent("events.jsonl")
        try FileManager.default.createDirectory(at: events.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("{\"kind\":\"test\"}\n".utf8).write(to: events)
        try makeComputerHistoryMetadata(root: root, startedAt: startedAt, eventsPath: events.path)
        return events
    }

    private func makeComputerHistoryMetadata(root: URL, startedAt: Date, eventsPath: String) throws {
        let directory = root
            .appendingPathComponent("segments", isDirectory: true)
            .appendingPathComponent("2026-09-04T17-39-00Z", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let payload: [String: String] = [
            "eventsPath": eventsPath,
            "id": "2026-09-04T17-39-00Z",
            "startedAt": ISO8601DateFormatter().string(from: startedAt),
        ]
        let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        try data.write(to: directory.appendingPathComponent("metadata.json"))
    }
}
