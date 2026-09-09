import XCTest
@testable import QuietDeskCore

@MainActor
final class FeedConnectionPlanTests: XCTestCase {
    func testDefaultCatalogSeparatesInputsRecallAndPublishing() {
        let plans = FeedConnectionPlan.defaults

        XCTAssertEqual(plans.map(\.id), FeedConnectionID.allCases)
        XCTAssertEqual(Set(plans.map(\.id)).count, FeedConnectionID.allCases.count)
        XCTAssertTrue(plans.allSatisfy { !$0.isEnabled })
        XCTAssertEqual(plans.filter { $0.id.boundary == .outsideInput }.count, 2)
        XCTAssertEqual(plans.filter { $0.id.boundary == .insideRecall }.count, 1)
        XCTAssertEqual(plans.filter { $0.id.boundary == .publicOutput }.count, 3)
    }

    func testInputFeedsCannotAcquirePublishingPermission() {
        for id in [FeedConnectionID.xFollowing, .linkedInOrganic, .computerHistoryToday] {
            XCTAssertEqual(id.allowedPermissions, [.readOnly])
        }
    }

    func testEnabledAccountFeedRequiresExactIdentity() {
        var plan = FeedConnectionPlan(id: .xFollowing, isEnabled: true)
        XCTAssertNotNil(plan.validationMessage)
        XCTAssertFalse(plan.isReadyToAuthorize)

        plan.accountIdentifier = "tonylongname"
        XCTAssertEqual(plan.validationMessage, "Use the exact X handle beginning with @.")

        plan.accountIdentifier = "  @tonylongname  "
        XCTAssertNil(plan.validationMessage)
        XCTAssertTrue(plan.isReadyToAuthorize)
    }

    func testSavingPlanPersistsOnlyConfigurationAndNormalizesAccounts() {
        let suite = "FeedConnectionPlanTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }

        var plans = FeedConnectionPlan.defaults
        let index = plans.firstIndex { $0.id == .xFollowing }!
        plans[index].isEnabled = true
        plans[index].accountIdentifier = "  @tonylongname  "

        let firstStore = QuietDeskStore(client: .bundledSyntheticFixtures, defaults: defaults)
        firstStore.replaceFeedConnectionPlans(plans)

        XCTAssertEqual(firstStore.requestedFeedCount, 1)
        XCTAssertEqual(firstStore.feedsReadyToAuthorizeCount, 1)
        XCTAssertEqual(firstStore.feedConnectionPlans[index].accountIdentifier, "@tonylongname")
        XCTAssertEqual(firstStore.lastNotice, "Feed plan saved locally. No account was connected.")

        let reloadedStore = QuietDeskStore(client: .bundledSyntheticFixtures, defaults: defaults)
        XCTAssertEqual(reloadedStore.feedConnectionPlans, firstStore.feedConnectionPlans)
        XCTAssertEqual(reloadedStore.requestedFeedCount, 1)
    }

    func testNormalizationRepairsInvalidPermissionAndMissingCatalogRows() {
        let partial = [
            FeedConnectionPlan(
                id: .xFollowing,
                isEnabled: true,
                accountIdentifier: "@tonylongname",
                permission: .standingPolicy
            ),
        ]

        let normalized = FeedConnectionPlan.normalized(partial)

        XCTAssertEqual(normalized.count, FeedConnectionID.allCases.count)
        XCTAssertEqual(normalized.first?.permission, .readOnly)
    }
}
