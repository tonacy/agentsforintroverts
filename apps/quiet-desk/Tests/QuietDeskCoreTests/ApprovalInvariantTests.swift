import XCTest
@testable import QuietDeskCore

@MainActor
final class ApprovalInvariantTests: XCTestCase {
    private let fixedNow = Date(timeIntervalSince1970: 1_787_151_600)

    func testReadOnlyModeBlocksApproval() throws {
        let store = try makeLoadedStore(readOnly: true)
        let itemID = try XCTUnwrap(store.snapshot.items.first {
            $0.proofLedger.contains(.proposed) && !$0.proofLedger.contains(.approved)
        }?.id)

        XCTAssertThrowsError(try store.approveAction(for: itemID)) { error in
            XCTAssertEqual(error as? ApprovalError, .readOnlyMode)
        }
        XCTAssertTrue(try XCTUnwrap(store.item(id: itemID)?.proofLedger).contains(.proposed))
        XCTAssertFalse(try XCTUnwrap(store.item(id: itemID)?.proofLedger).contains(.approved))
        XCTAssertTrue(store.approvalReceipts.isEmpty)
    }

    func testLocalApprovalStopsAtApprovedAndMakesNoDeliveryClaim() throws {
        let store = try makeLoadedStore(readOnly: false)
        let item = try XCTUnwrap(store.snapshot.items.first {
            $0.proofLedger.contains(.proposed) && !$0.proofLedger.contains(.approved)
        })
        let action = try XCTUnwrap(item.action)

        let receipt = try store.approveAction(for: item.id)
        let updatedLedger = try XCTUnwrap(store.item(id: item.id)?.proofLedger)

        XCTAssertTrue(updatedLedger.contains(.proposed))
        XCTAssertTrue(updatedLedger.contains(.approved))
        XCTAssertFalse(updatedLedger.contains(.providerAcknowledged))
        XCTAssertFalse(updatedLedger.contains(.delivered))
        XCTAssertFalse(updatedLedger.contains(.read))
        XCTAssertEqual(store.item(id: item.id)?.run.state, .waitingForHub)
        XCTAssertFalse(updatedLedger.hasDeliveryEvidence)
        XCTAssertEqual(receipt.recordedEvidence, .approved)
        XCTAssertEqual(receipt.actionID, action.id)
        XCTAssertEqual(receipt.actionRevision, action.revision)
        XCTAssertEqual(receipt.payloadSHA256, action.payloadSHA256)
        XCTAssertTrue(receipt.note.contains("No provider request was made"))
        XCTAssertFalse(receipt.note.localizedCaseInsensitiveContains("sent successfully"))
    }

    func testAlreadyApprovedActionCannotBeApprovedAgain() throws {
        let store = try makeLoadedStore(readOnly: false)
        let itemID = try XCTUnwrap(store.snapshot.items.first {
            $0.proofLedger.contains(.approved)
        }?.id)

        XCTAssertThrowsError(try store.approveAction(for: itemID)) { error in
            XCTAssertEqual(error as? ApprovalError, .alreadyApproved)
        }
    }

    func testProviderAcknowledgementWithoutProposalCannotBeLocallyApproved() throws {
        let store = try makeLoadedStore(readOnly: false)
        let itemID = try XCTUnwrap(store.snapshot.items.first {
            $0.proofLedger.contains(.providerAcknowledged)
                && !$0.proofLedger.contains(.proposed)
        }?.id)

        XCTAssertThrowsError(try store.approveAction(for: itemID)) { error in
            XCTAssertEqual(error as? ApprovalError, .missingProposalEvidence)
        }
        XCTAssertFalse(try XCTUnwrap(store.item(id: itemID)?.proofLedger).contains(.approved))
    }

    func testAllFixtureExternalActionsAreApprovalGated() throws {
        let snapshot = try QuietDeskFixtureLoader.load()

        XCTAssertTrue(snapshot.approvalPolicyViolations.isEmpty)
        XCTAssertTrue(snapshot.items.compactMap(\.action).allSatisfy { action in
            action.kind.isExternal && action.requiresExplicitApproval
        })
    }

    private func makeLoadedStore(readOnly: Bool) throws -> QuietDeskStore {
        let snapshot = try QuietDeskFixtureLoader.load()
        let fixedNow = fixedNow
        let store = QuietDeskStore(
            client: .bundledSyntheticFixtures,
            initialSnapshot: snapshot,
            initialLoadState: .loaded(fixedNow),
            defaults: nil,
            now: { fixedNow }
        )
        store.readOnlyMode = readOnly
        return store
    }
}
