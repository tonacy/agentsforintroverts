import XCTest
@testable import QuietDeskCore

final class ProofLabelTests: XCTestCase {
    func testProofLabelsDoNotCollapseProviderAcknowledgementIntoDelivery() {
        XCTAssertEqual(ProofKind.proposed.label, "Proposed")
        XCTAssertEqual(ProofKind.approved.label, "Approved")
        XCTAssertEqual(ProofKind.providerAcknowledged.label, "Provider acknowledged")
        XCTAssertEqual(ProofKind.delivered.label, "Delivered")
        XCTAssertEqual(ProofKind.read.label, "Read")
    }

    func testProviderAcknowledgementIsIndependent() {
        let ledger = ProofLedger([.providerAcknowledged])

        XCTAssertTrue(ledger.contains(.providerAcknowledged))
        XCTAssertFalse(ledger.contains(.proposed))
        XCTAssertFalse(ledger.contains(.approved))
        XCTAssertFalse(ledger.contains(.delivered))
        XCTAssertFalse(ledger.contains(.read))
        XCTAssertFalse(ledger.hasDeliveryEvidence)
    }

    func testDeliveryAndReadAreIndependent() {
        let deliveryOnly = ProofLedger([.delivered])
        let readOnly = ProofLedger([.read])

        XCTAssertTrue(deliveryOnly.hasDeliveryEvidence)
        XCTAssertFalse(deliveryOnly.hasReadEvidence)
        XCTAssertFalse(readOnly.hasDeliveryEvidence)
        XCTAssertTrue(readOnly.hasReadEvidence)
        XCTAssertFalse(readOnly.contains(.delivered))
    }
}
