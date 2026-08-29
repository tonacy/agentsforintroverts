import XCTest
@testable import QuietDeskCore

final class CommonGroundThreadTests: XCTestCase {
    func testThreadsNarrowBroadDiscourseToAtMostThreeEvidenceBackedPeople() throws {
        let snapshot = try QuietDeskFixtureLoader.load()

        XCTAssertFalse(snapshot.threads.isEmpty)
        for thread in snapshot.threads {
            XCTAssertTrue(thread.narrowing.isValid)
            XCTAssertLessThanOrEqual(
                thread.people.count,
                QuietDeskPresentationPolicy.maximumPeoplePerThread
            )
            XCTAssertEqual(thread.narrowing.peopleWithinReach, thread.people.count)

            let claimIDs = Set(thread.claims.map(\.id))
            XCTAssertTrue(thread.people.allSatisfy { person in
                !person.evidenceClaimIDs.isEmpty
                    && person.evidenceClaimIDs.allSatisfy(claimIDs.contains)
            })
        }
    }

    func testHandoffReadyPeopleHaveSourceBackedSyntheticTargetsBoundToProposal() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let thread = try XCTUnwrap(snapshot.threads.first { $0.stage == .handoffReady })
        let handoffID = try XCTUnwrap(thread.handoffFeedItemID)
        let action = try XCTUnwrap(snapshot.items.first { $0.id == handoffID }?.action)

        XCTAssertTrue(thread.people.allSatisfy { person in
            guard let target = person.targetIdentifier else { return false }
            return target.hasSuffix(".invalid") && action.target.contains(target)
        })

        let optInClaims = thread.claims.filter { $0.sourceTitle.contains("opt-in") }
        XCTAssertEqual(optInClaims.count, 1)
        let optInClaim = try XCTUnwrap(optInClaims.first)
        XCTAssertTrue(thread.people.allSatisfy { $0.evidenceClaimIDs.contains(optInClaim.id) })
    }

    func testLivingContextKeepsInferenceDistinctFromExplicitStatements() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let inferred = snapshot.personalContext.statements.filter(\.needsConfirmation)
        let explicit = snapshot.personalContext.statements.filter { $0.basis == .explicit }

        XCTAssertEqual(inferred.count, 1)
        XCTAssertFalse(explicit.isEmpty)
        XCTAssertTrue(inferred.allSatisfy { !$0.sourceFeedItemIDs.isEmpty })
        XCTAssertTrue(explicit.allSatisfy { $0.confidence == 1 })
    }

    @MainActor
    func testHumanHandoffStopsAtAnExactLocalApproval() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let thread = try XCTUnwrap(snapshot.threads.first { $0.stage == .handoffReady })
        let handoffID = try XCTUnwrap(thread.handoffFeedItemID)
        let store = QuietDeskStore(
            client: .bundledSyntheticFixtures,
            initialSnapshot: snapshot,
            initialLoadState: .loaded(snapshot.generatedAt),
            defaults: nil
        )
        store.readOnlyMode = false

        let before = try XCTUnwrap(store.item(id: handoffID))
        XCTAssertTrue(before.proofLedger.contains(.proposed))
        XCTAssertFalse(before.proofLedger.contains(.approved))
        XCTAssertEqual(store.pendingHandoffCount, 1)

        _ = try store.approveAction(for: handoffID)

        let after = try XCTUnwrap(store.item(id: handoffID))
        XCTAssertTrue(after.proofLedger.contains(.approved))
        XCTAssertFalse(after.proofLedger.contains(.providerAcknowledged))
        XCTAssertFalse(after.proofLedger.contains(.delivered))
        XCTAssertFalse(after.proofLedger.contains(.read))
        XCTAssertEqual(after.run.state, .waitingForHub)
        XCTAssertEqual(store.pendingHandoffCount, 0)
    }

    func testThreadSearchCoversCommonGroundPeopleAndFit() throws {
        let snapshot = try QuietDeskFixtureLoader.load()

        XCTAssertEqual(snapshot.conversationThreads(query: "public discourse").count, 1)
        XCTAssertEqual(snapshot.conversationThreads(query: "Jordan Example").count, 1)
        XCTAssertEqual(snapshot.conversationThreads(query: "early idea failing to travel").count, 1)
        XCTAssertTrue(snapshot.conversationThreads(query: "does-not-exist").isEmpty)
    }
}
