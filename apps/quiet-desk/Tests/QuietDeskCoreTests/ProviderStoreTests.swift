import XCTest
@testable import QuietDeskCore

@MainActor
final class ProviderStoreTests: XCTestCase {
    private static let catalog = """
    { "schema": "afi.provider_catalog.v1", "checked_at": "2026-09-07T18:00:00.000Z", "preferred": null,
      "providers": [
        { "id": "claude", "label": "Claude Code", "kind": "harness", "installed": true, "path": "/x/claude", "version": "2.1.263", "signed_in": true, "sign_in_hint": null, "models": [{"id": null, "label": "Default"}] },
        { "id": "fixture", "label": "Sample day (offline)", "kind": "fixture", "installed": true, "path": null, "version": null, "signed_in": true, "sign_in_hint": null, "models": [{"id": null, "label": "Canned"}] }
      ] }
    """

    private static let catalogPreferringClaude = catalog.replacingOccurrences(of: "\"preferred\": null", with: "\"preferred\": \"claude\"")

    private static let statusBefore = """
    { "schema": "afi.day_status.v1", "date": "2026-09-07", "weekday": "Monday",
      "capture": { "exists": true, "path": "/w/daily/2026-09-07/capture.md", "author_human": true },
      "sources": { "verified_in_window": 4, "window_days": 7, "last_collected_at": null },
      "latest_run": null,
      "conversation": { "exists": false, "path": null, "places": 0, "developments": 0, "public_exported": false, "public_path": null },
      "provider_preference": { "provider": "claude", "model": null } }
    """

    private static let statusAfter = """
    { "schema": "afi.day_status.v1", "date": "2026-09-07", "weekday": "Monday",
      "capture": { "exists": true, "path": "/w/daily/2026-09-07/capture.md", "author_human": true },
      "sources": { "verified_in_window": 4, "window_days": 7, "last_collected_at": null },
      "latest_run": { "run_id": "run_1", "status": "completed", "provider": "claude", "model": null, "started_at": null, "finished_at": null, "blockers": [], "notes": [], "usage": null },
      "conversation": { "exists": true, "path": "/w/daily/2026-09-07/daily-conversation.md", "places": 2, "developments": 3, "public_exported": false, "public_path": null },
      "provider_preference": { "provider": "claude", "model": null } }
    """

    private func makeStore(bridge: StubRunnerBridge) -> ProviderStore {
        let defaults = UserDefaults(suiteName: "quiet-desk-tests-\(UUID().uuidString)")!
        let store = ProviderStore(
            bridge: bridge,
            defaults: defaults,
            environmentProvider: {
                RunnerEnvironment(
                    repoRoot: URL(fileURLWithPath: "/repo"),
                    node: URL(fileURLWithPath: "/node"),
                    path: "/bin"
                )
            },
            today: { "2026-09-07" }
        )
        store.workspacePath = "/w"
        return store
    }

    func testRefreshProvidersFillsTheCatalog() async {
        let bridge = StubRunnerBridge(responses: ["providers.list": Self.catalog])
        let store = makeStore(bridge: bridge)

        await store.refreshProviders()

        XCTAssertEqual(store.catalog?.providers.map(\.id), ["claude", "fixture"])
        XCTAssertNil(store.preferredProvider)
        XCTAssertNil(store.lastError)
        let calls = await bridge.calls
        XCTAssertEqual(calls.map(\.name), ["providers.list"])
        XCTAssertEqual(calls.first?.arguments, ["list", "--json", "--workspace", "/w"])
    }

    func testChooseWritesThePreferenceThenListsAgain() async {
        let bridge = StubRunnerBridge(responses: [
            "providers.use": #"{ "schema": "afi.provider_preference.v1", "provider": "claude", "model": null, "chosen_at": "2026-09-07T18:01:00.000Z" }"#,
            "providers.list": Self.catalogPreferringClaude,
        ])
        let store = makeStore(bridge: bridge)

        await store.choose(provider: "claude", model: nil)

        XCTAssertEqual(store.preferredProvider?.id, "claude")
        let calls = await bridge.calls
        XCTAssertEqual(calls.map(\.name), ["providers.use", "providers.list"])
        XCTAssertEqual(calls[0].arguments, ["use", "--workspace", "/w", "--provider", "claude", "--json"])
    }

    func testRunTodayUsesThePreferredProviderAndRefreshesStatus() async {
        let bridge = StubRunnerBridge(responses: [
            "providers.list": Self.catalogPreferringClaude,
            "status": Self.statusBefore,
            "run-day": #"{ "status": "completed", "exitCode": 0, "runId": "run_1", "blockers": [], "notes": [], "paths": {} }"#,
        ])
        let store = makeStore(bridge: bridge)
        await store.refreshProviders()
        await store.refreshStatus()
        XCTAssertNil(store.status?.latestRun)

        await bridge.set(response: Self.statusAfter, for: "status")
        await store.runToday(mode: .deep)

        XCTAssertEqual(store.lastRun?.status, .completed)
        XCTAssertEqual(store.status?.conversation.places, 2)
        XCTAssertFalse(store.isBusy)
        let calls = await bridge.calls
        let run = calls.first { $0.name == "run-day" }
        XCTAssertEqual(run?.arguments, ["--workspace", "/w", "--date", "2026-09-07", "--provider", "claude", "--mode", "deep"])
        XCTAssertEqual(calls.last?.name, "status", "status is refreshed after the run")
    }

    func testAPartialRunIsAResultNotAnError() async {
        let bridge = StubRunnerBridge(responses: [
            "status": Self.statusBefore,
            "run-day": #"{ "status": "partial", "exitCode": 3, "runId": "run_2", "blockers": ["outside_context_not_ready"], "notes": [], "paths": {} }"#,
        ])
        await bridge.set(exitCode: 3, for: "run-day")
        let store = makeStore(bridge: bridge)

        await store.runToday(mode: .short)

        XCTAssertEqual(store.lastRun?.status, .partial)
        XCTAssertEqual(store.lastRun?.blockers, ["outside_context_not_ready"])
        XCTAssertNil(store.lastError)
    }

    func testRunTodayRefusesWithoutAWorkspace() async {
        let bridge = StubRunnerBridge(responses: [:])
        let store = makeStore(bridge: bridge)
        store.workspacePath = nil

        await store.runToday(mode: .short)

        XCTAssertNil(store.lastRun)
        XCTAssertNotNil(store.lastError)
        let calls = await bridge.calls
        XCTAssertTrue(calls.isEmpty)
    }

    func testApproveIsExplicitAndPassesTheApproveFlag() async {
        let bridge = StubRunnerBridge(responses: [
            "export-public": #"{ "path": "/w/daily/2026-09-07/public.json", "out": "/repo/src/content/day.json" }"#,
            "status": Self.statusAfter,
        ])
        let store = makeStore(bridge: bridge)

        await store.approveForSite(includeInside: false, outPath: "/repo/src/content/day.json")

        XCTAssertEqual(store.lastExport?.out, "/repo/src/content/day.json")
        let calls = await bridge.calls
        let export = calls.first { $0.name == "export-public" }
        XCTAssertEqual(export?.arguments, ["--workspace", "/w", "--date", "2026-09-07", "--approve", "--out", "/repo/src/content/day.json"])
    }

    func testCreateCaptureAndCollectReportBack() async {
        let bridge = StubRunnerBridge(responses: [
            "capture.new": #"{ "path": "/w/daily/2026-09-07/capture.md", "created": true }"#,
            "collect": #"{ "written": 2, "skipped": 4, "errors": [] }"#,
            "status": Self.statusBefore,
        ])
        let store = makeStore(bridge: bridge)

        let path = await store.createCapture()
        XCTAssertEqual(path, "/w/daily/2026-09-07/capture.md")

        await store.collect()
        XCTAssertEqual(store.lastCollect?.written, 2)
        XCTAssertNil(store.lastError)
    }

    func testABridgeFailureLandsInLastErrorNotACrash() async {
        let bridge = StubRunnerBridge(responses: [:])
        let store = makeStore(bridge: bridge)

        await store.refreshProviders()

        XCTAssertNil(store.catalog)
        XCTAssertNotNil(store.lastError)
        XCTAssertFalse(store.isBusy)
    }

    func testWorkspacePathPersistsAndDefaultSiteDayFileFollowsTheRepo() {
        let suite = "quiet-desk-tests-persist-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let environment = RunnerEnvironment(repoRoot: URL(fileURLWithPath: "/repo"), node: URL(fileURLWithPath: "/node"), path: "/bin")
        let store = ProviderStore(bridge: StubRunnerBridge(responses: [:]), defaults: defaults, environmentProvider: { environment }, today: { "2026-09-07" })
        XCTAssertNil(store.workspacePath)
        store.workspacePath = "/w"
        XCTAssertEqual(defaults.string(forKey: "quietDesk.workspacePath"), "/w")
        XCTAssertEqual(store.siteDayFilePath, "/repo/src/content/day.json")
        store.siteDayFileOverride = "/elsewhere/day.json"
        XCTAssertEqual(store.siteDayFilePath, "/elsewhere/day.json")

        let reloaded = ProviderStore(bridge: StubRunnerBridge(responses: [:]), defaults: defaults, environmentProvider: { environment }, today: { "2026-09-07" })
        XCTAssertEqual(reloaded.workspacePath, "/w")
        XCTAssertEqual(reloaded.workspaceName, "w")
    }
}
