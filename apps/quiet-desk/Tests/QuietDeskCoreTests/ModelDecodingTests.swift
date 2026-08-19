import XCTest
@testable import QuietDeskCore

final class ModelDecodingTests: XCTestCase {
    func testBundledFixturesDecodeAsClearlySyntheticData() throws {
        let snapshot = try QuietDeskFixtureLoader.load()

        XCTAssertTrue(snapshot.isSynthetic)
        XCTAssertEqual(snapshot.items.count, 7)
        XCTAssertEqual(snapshot.agents.count, 5)
        XCTAssertEqual(snapshot.sources.count, 6)
        XCTAssertTrue(snapshot.items.allSatisfy { !$0.claims.isEmpty })
        XCTAssertTrue(snapshot.approvalPolicyViolations.isEmpty)
    }

    func testEveryExternalActionHasAnExactStableHash() throws {
        let snapshot = try QuietDeskFixtureLoader.load()
        let actions = snapshot.items.compactMap(\.action)

        XCTAssertFalse(actions.isEmpty)
        XCTAssertTrue(actions.allSatisfy(\.requiresExplicitApproval))
        XCTAssertTrue(actions.allSatisfy { $0.payloadSHA256.count == 64 })
        XCTAssertTrue(actions.allSatisfy { $0.payloadSHA256 == $0.payloadSHA256.lowercased() })
    }

    func testKnownSHA256Vector() {
        let action = ProposedAction(
            id: UUID(uuidString: "aaaaaaaa-0000-0000-0000-000000000001")!,
            revision: 7,
            kind: .sendMessage,
            account: "Fixture Account",
            channel: "Fixture",
            target: "Nobody",
            exactPayload: "hello",
            requiresExplicitApproval: true
        )

        XCTAssertEqual(
            action.payloadSHA256,
            "4779da97bc93c06f7c4f51fea10fba07634be4f48f43f4483f37f8381c10f237"
        )
    }

    func testProviderPayloadHashChangesWithTargetOrAccount() {
        let baseline = action(account: "primary@example.invalid", target: "First")
        let changedAccount = action(account: "secondary@example.invalid", target: "First")
        let changedTarget = action(account: "primary@example.invalid", target: "Second")

        XCTAssertNotEqual(baseline.payloadSHA256, changedAccount.payloadSHA256)
        XCTAssertNotEqual(baseline.payloadSHA256, changedTarget.payloadSHA256)
    }

    private func action(account: String, target: String) -> ProposedAction {
        ProposedAction(
            id: UUID(uuidString: "aaaaaaaa-0000-0000-0000-000000000002")!,
            revision: 1,
            kind: .sendMessage,
            account: account,
            channel: "Email",
            target: target,
            exactPayload: "Exact body",
            requiresExplicitApproval: true
        )
    }
}
