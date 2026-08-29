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
}
