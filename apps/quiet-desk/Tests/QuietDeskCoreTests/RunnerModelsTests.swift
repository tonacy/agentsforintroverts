import XCTest
@testable import QuietDeskCore

final class RunnerModelsTests: XCTestCase {
    private let catalogJSON = """
    { "schema": "afi.provider_catalog.v1", "checked_at": "2026-09-07T18:00:00.000Z",
      "preferred": "claude",
      "providers": [
        { "id": "claude", "label": "Claude Code", "kind": "harness", "installed": true, "path": "/Users/x/.local/bin/claude", "version": "2.1.263", "signed_in": true, "sign_in_hint": "Open a terminal, run `claude`, then `/login`.", "models": [{"id": null, "label": "Default"}, {"id": "opus", "label": "Opus"}] },
        { "id": "codex", "label": "Codex CLI", "kind": "harness", "installed": true, "path": "/Users/x/bin/codex", "version": "0.153.2", "signed_in": false, "sign_in_hint": "Run `codex login` in a terminal.", "models": [{"id": null, "label": "Default"}] },
        { "id": "anthropic", "label": "Anthropic account", "kind": "sdk", "installed": false, "path": null, "version": null, "signed_in": null, "sign_in_hint": "brew install anthropics/tap/ant, then `ant auth login`.", "models": [{"id": null, "label": "Default (claude-opus-5)"}] },
        { "id": "fixture", "label": "Sample day (offline)", "kind": "fixture", "installed": true, "path": null, "version": null, "signed_in": true, "sign_in_hint": null, "models": [{"id": null, "label": "Canned"}] }
      ] }
    """

    func testProviderCatalogDecodesEveryAvailabilityIncludingUnknown() throws {
        let catalog = try RunnerJSON.decode(ProviderCatalog.self, from: Data(catalogJSON.utf8))

        XCTAssertEqual(catalog.schema, "afi.provider_catalog.v1")
        XCTAssertEqual(catalog.preferred, "claude")
        XCTAssertEqual(catalog.providers.map(\.id), ["claude", "codex", "anthropic", "fixture"])

        XCTAssertEqual(catalog.providers[0].availability, .signedIn)
        XCTAssertEqual(catalog.providers[1].availability, .notSignedIn)
        XCTAssertEqual(catalog.providers[2].availability, .notInstalled)
        XCTAssertNil(catalog.providers[2].signedIn)
        XCTAssertEqual(catalog.providers[3].availability, .signedIn)
        XCTAssertEqual(catalog.providers[0].kind, .harness)
        XCTAssertEqual(catalog.providers[2].kind, .sdk)
        XCTAssertNil(catalog.providers[3].signInHint)

        XCTAssertEqual(catalog.providers[0].models.count, 2)
        XCTAssertNil(catalog.providers[0].models[0].id)
        XCTAssertEqual(catalog.providers[0].models[1].id, "opus")
        XCTAssertEqual(catalog.preferredProvider?.id, "claude")
        XCTAssertTrue(catalog.providers[0].canRun)
        XCTAssertFalse(catalog.providers[1].canRun)
    }

    func testUnknownInstalledProviderIsReportedAsUnknownNotBlocked() throws {
        let json = """
        { "schema": "afi.provider_catalog.v1", "checked_at": "2026-09-07T18:00:00.000Z", "preferred": null,
          "providers": [ { "id": "anthropic", "label": "Anthropic account", "kind": "sdk", "installed": true, "path": null, "version": null, "signed_in": null, "sign_in_hint": null, "models": [] } ] }
        """
        let catalog = try RunnerJSON.decode(ProviderCatalog.self, from: Data(json.utf8))
        XCTAssertNil(catalog.preferred)
        XCTAssertNil(catalog.preferredProvider)
        XCTAssertEqual(catalog.providers[0].availability, .unknown)
        XCTAssertTrue(catalog.providers[0].canRun, "an unknown sign-in state must not block a run; the runner reports the real failure")
    }

    func testProviderPreferenceDecodes() throws {
        let json = """
        { "schema": "afi.provider_preference.v1", "provider": "claude", "model": null, "chosen_at": "2026-09-07T18:01:00.000Z" }
        """
        let preference = try RunnerJSON.decode(ProviderPreference.self, from: Data(json.utf8))
        XCTAssertEqual(preference.provider, "claude")
        XCTAssertNil(preference.model)
        XCTAssertNotNil(preference.chosenAt)
    }

    func testDayStatusDecodesWithNoRunYet() throws {
        let json = """
        { "schema": "afi.day_status.v1", "date": "2026-09-07", "weekday": "Monday",
          "capture": { "exists": false, "path": null, "author_human": null },
          "sources": { "verified_in_window": 0, "window_days": 7, "last_collected_at": null },
          "latest_run": null,
          "conversation": { "exists": false, "path": null, "places": 0, "developments": 0, "public_exported": false, "public_path": null },
          "provider_preference": null }
        """
        let status = try RunnerJSON.decode(DayStatus.self, from: Data(json.utf8))
        XCTAssertEqual(status.weekday, "Monday")
        XCTAssertFalse(status.capture.exists)
        XCTAssertNil(status.capture.authorHuman)
        XCTAssertEqual(status.sources.verifiedInWindow, 0)
        XCTAssertNil(status.sources.lastCollectedAt)
        XCTAssertNil(status.latestRun)
        XCTAssertFalse(status.conversation.exists)
        XCTAssertNil(status.providerPreference)
    }

    func testDayStatusDecodesACompletedDay() throws {
        let json = """
        { "schema": "afi.day_status.v1", "date": "2026-09-07", "weekday": "Monday",
          "capture": { "exists": true, "path": "/w/daily/2026-09-07/capture.md", "author_human": true },
          "sources": { "verified_in_window": 6, "window_days": 7, "last_collected_at": "2026-09-07T17:00:00.000Z" },
          "latest_run": { "run_id": "run_20260907_1", "status": "completed", "provider": "claude", "model": "opus", "started_at": "2026-09-07T17:10:00.000Z", "finished_at": "2026-09-07T17:12:00.000Z", "blockers": [], "notes": ["fine"], "usage": { "input_tokens": 12, "output_tokens": 3, "nested": { "x": 1 } } },
          "conversation": { "exists": true, "path": "/w/daily/2026-09-07/daily-conversation.md", "places": 2, "developments": 3, "public_exported": false, "public_path": null },
          "provider_preference": { "provider": "claude", "model": null } }
        """
        let status = try RunnerJSON.decode(DayStatus.self, from: Data(json.utf8))
        let run = try XCTUnwrap(status.latestRun)
        XCTAssertEqual(run.status, .completed)
        XCTAssertEqual(run.provider, "claude")
        XCTAssertEqual(run.model, "opus")
        XCTAssertEqual(run.notes, ["fine"])
        XCTAssertEqual(status.conversation.places, 2)
        XCTAssertEqual(status.conversation.developments, 3)
        XCTAssertEqual(status.providerPreference?.provider, "claude")
        XCTAssertTrue(status.capture.authorHuman == true)
    }

    func testRunDayResultKeepsCamelCaseKeysAndExitCode() throws {
        let json = """
        { "status": "partial", "exitCode": 3, "runId": "run_1", "blockers": ["outside_context_not_ready"], "notes": [], "paths": { "run": "/w/runs/run_1.json" } }
        """
        let result = try RunnerJSON.decode(RunDayResult.self, from: Data(json.utf8))
        XCTAssertEqual(result.status, .partial)
        XCTAssertEqual(result.exitCode, 3)
        XCTAssertEqual(result.runId, "run_1")
        XCTAssertEqual(result.blockers, ["outside_context_not_ready"])
    }

    func testExportCollectAndCaptureResultsDecode() throws {
        let export = try RunnerJSON.decode(ExportResult.self, from: Data(#"{ "path": "/w/daily/2026-09-07/public.json", "out": null }"#.utf8))
        XCTAssertEqual(export.path, "/w/daily/2026-09-07/public.json")
        XCTAssertNil(export.out)

        let collect = try RunnerJSON.decode(CollectResult.self, from: Data(#"{ "written": 6, "skipped": 3, "errors": [ { "url": "https://x", "message": "timeout" } ] }"#.utf8))
        XCTAssertEqual(collect.written, 6)
        XCTAssertEqual(collect.errors.first?.message, "timeout")

        let capture = try RunnerJSON.decode(CaptureResult.self, from: Data(#"{ "path": "/w/daily/2026-09-07/capture.md", "created": true }"#.utf8))
        XCTAssertTrue(capture.created)
    }

    func testBlockersRenderAsPlainSentences() {
        XCTAssertEqual(RunBlocker.explanation(for: "capture_missing"), "There is no capture for today yet. Write one in your own words first.")
        XCTAssertEqual(RunBlocker.explanation(for: "outside_context_not_ready"), "Fewer than two verified public sources were collected in the window. Collect first.")
        XCTAssertEqual(RunBlocker.explanation(for: "provider_error"), "The provider could not be reached or returned an error. Check its sign-in and try again.")
        XCTAssertEqual(RunBlocker.explanation(for: "provider_stop_refusal"), "The provider declined this request. Nothing was written.")
        XCTAssertEqual(RunBlocker.explanation(for: "no_source_backed_claims"), "Every claim cited an unknown source and was dropped. Nothing source-backed survived.")
        XCTAssertEqual(RunBlocker.explanation(for: "something_else"), "The run stopped: something_else.")
    }
}
