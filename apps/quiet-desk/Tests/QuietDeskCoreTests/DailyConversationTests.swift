import XCTest
@testable import QuietDeskCore

final class DailyConversationTests: XCTestCase {
    func testModesUseTheHarnessNeutralContractVocabulary() {
        XCTAssertEqual(DailyConversationMode.short.rawValue, "short")
        XCTAssertEqual(DailyConversationMode.deep.rawValue, "deep")
        XCTAssertEqual(DailyConversationMode.noNewInput.rawValue, "no_new_input")
        XCTAssertEqual(DailyConversationMode.notChecked.rawValue, "not_checked")
        XCTAssertEqual(DailyConversationMode.choices, [.short, .deep, .noNewInput])
    }

    func testShortConversationShowsAtMostOneSupportingThread() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let projection = snapshot.dailyConversationProjection(for: .short)

        XCTAssertLessThanOrEqual(
            projection.supportingThreads.count,
            QuietDeskPresentationPolicy.maximumSupportingThreadsForShortConversation
        )
        XCTAssertEqual(projection.supportingThreads.count, 1)
    }

    func testDeepConversationShowsAtMostThreeSupportingThreads() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let projection = snapshot.dailyConversationProjection(for: .deep)

        XCTAssertLessThanOrEqual(
            projection.supportingThreads.count,
            QuietDeskPresentationPolicy.maximumSupportingThreadsForDeepConversation
        )
        XCTAssertEqual(projection.supportingThreads.count, 2)
    }

    func testNoNewInputIntroducesNoSupportingThreadAndExplainsTheNoOp() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let projection = snapshot.dailyConversationProjection(for: .noNewInput)

        XCTAssertTrue(projection.supportingThreads.isEmpty)
        XCTAssertFalse(try XCTUnwrap(projection.noActionReason).isEmpty)
    }

    func testUncheckedConversationSynthesizesNothing() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let projection = snapshot.dailyConversationProjection(for: .notChecked)

        XCTAssertTrue(projection.supportingThreads.isEmpty)
        XCTAssertNil(projection.noActionReason)
    }

    func testSyntheticProjectionCannotSurfaceAPlace() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let projection = snapshot.dailyConversationProjection(for: .deep)

        XCTAssertEqual(projection.outsideReadiness, .sampleOnly)
        XCTAssertEqual(projection.livedReadiness, .notConnected)
        XCTAssertFalse(projection.canSurfacePlaces)
        XCTAssertTrue(try XCTUnwrap(projection.noActionReason).contains("No Place"))
    }

    func testModeProjectionDoesNotMutateLivingContextOrUpgradeInference() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let originalContext = snapshot.personalContext
        let inferredIDs = Set(originalContext.statements.filter(\.needsConfirmation).map(\.id))

        for mode in DailyConversationMode.allCases {
            let projection = snapshot.dailyConversationProjection(for: mode)
            XCTAssertEqual(projection.context, originalContext)
            XCTAssertEqual(
                Set(projection.context.statements.filter(\.needsConfirmation).map(\.id)),
                inferredIDs
            )
        }

        XCTAssertEqual(snapshot.personalContext, originalContext)
    }

    func testFreshCuesEnterOnlyTheirOwnBoundaryAndRemainBelowThePlaceGate() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let now = Date(timeIntervalSince1970: 1_788_543_600)
        let cues = [
            cue(
                feedID: .xFollowing,
                boundary: .outsideInput,
                text: "An outside conversation may be worth discussing.",
                now: now,
                sourceDoors: [URL(string: "https://x.com/example/status/1")!]
            ),
            cue(
                feedID: .computerHistoryToday,
                boundary: .insideRecall,
                text: "The day may have been fragmented.",
                now: now
            ),
        ]

        let projection = snapshot.dailyConversationProjection(for: .short, feedCues: cues, now: now)
        XCTAssertEqual(projection.outsideCues.map(\.boundary), [.outsideInput])
        XCTAssertEqual(projection.insideCues.map(\.boundary), [.insideRecall])
        XCTAssertEqual(projection.outsideReadiness, .ready)
        XCTAssertEqual(projection.livedReadiness, .cueOnly)
        XCTAssertFalse(projection.canSurfacePlaces)
        XCTAssertTrue(try XCTUnwrap(projection.noActionReason).contains("recall prompt"))
    }

    func testConversationDepthBoundsCuesAndNoNewInputIgnoresAllOfThem() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let now = Date(timeIntervalSince1970: 1_788_543_600)
        let cues = (0..<5).flatMap { index in
            [
                cue(
                    feedID: .xFollowing,
                    boundary: .outsideInput,
                    text: "Outside cue \(index)",
                    now: now.addingTimeInterval(TimeInterval(index)),
                    sourceDoors: [URL(string: "https://x.com/example/status/\(index)")!]
                ),
                cue(
                    feedID: .computerHistoryToday,
                    boundary: .insideRecall,
                    text: "Inside cue \(index)",
                    now: now.addingTimeInterval(TimeInterval(index))
                ),
            ]
        }

        let short = snapshot.dailyConversationProjection(for: .short, feedCues: cues, now: now)
        XCTAssertEqual(short.outsideCues.count, 1)
        XCTAssertEqual(short.insideCues.count, 1)

        let deep = snapshot.dailyConversationProjection(for: .deep, feedCues: cues, now: now)
        XCTAssertEqual(deep.outsideCues.count, 3)
        XCTAssertEqual(deep.insideCues.count, 3)

        let none = snapshot.dailyConversationProjection(for: .noNewInput, feedCues: cues, now: now)
        XCTAssertTrue(none.outsideCues.isEmpty)
        XCTAssertTrue(none.insideCues.isEmpty)
        XCTAssertFalse(none.canSurfacePlaces)
    }

    private func cue(
        feedID: FeedConnectionID,
        boundary: FeedBoundary,
        text: String,
        now: Date,
        sourceDoors: [URL] = []
    ) -> FeedCue {
        FeedCue(
            feedID: feedID,
            boundary: boundary,
            planRevision: 1,
            planHash: "sha256:\(String(repeating: "a", count: 64))",
            receiptID: UUID().uuidString.lowercased(),
            minimizedCue: text,
            observedAt: now,
            recordedAt: now,
            expiresAt: now.addingTimeInterval(60 * 60),
            sourceDoors: sourceDoors
        )
    }
}
