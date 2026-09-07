import XCTest
@testable import QuietDeskCore

final class RunnerCommandTests: XCTestCase {
    func testListProvidersWithAndWithoutAWorkspace() {
        XCTAssertEqual(RunnerCommand.listProviders(workspace: nil).arguments, ["list", "--json"])
        XCTAssertEqual(RunnerCommand.listProviders(workspace: "/w").arguments, ["list", "--json", "--workspace", "/w"])
        XCTAssertEqual(RunnerCommand.listProviders(workspace: nil).script, "providers.mjs")
        XCTAssertEqual(RunnerCommand.listProviders(workspace: nil).name, "providers.list")
    }

    func testUseProviderOmitsModelWhenNil() {
        let plain = RunnerCommand.useProvider(workspace: "/w", provider: "claude", model: nil)
        XCTAssertEqual(plain.arguments, ["use", "--workspace", "/w", "--provider", "claude", "--json"])
        let withModel = RunnerCommand.useProvider(workspace: "/w", provider: "claude", model: "opus")
        XCTAssertEqual(withModel.arguments, ["use", "--workspace", "/w", "--provider", "claude", "--model", "opus", "--json"])
    }

    func testStatusCaptureAndCollect() {
        XCTAssertEqual(RunnerCommand.status(workspace: "/w", date: "2026-09-07").arguments, ["--workspace", "/w", "--date", "2026-09-07", "--json"])
        XCTAssertEqual(RunnerCommand.status(workspace: "/w", date: "2026-09-07").script, "status.mjs")
        XCTAssertEqual(RunnerCommand.newCapture(workspace: "/w", date: "2026-09-07").arguments, ["new", "--workspace", "/w", "--date", "2026-09-07", "--json"])
        XCTAssertEqual(RunnerCommand.newCapture(workspace: "/w", date: "2026-09-07").script, "capture.mjs")
        XCTAssertEqual(RunnerCommand.collect(workspace: "/w").arguments, ["--workspace", "/w", "--json"])
    }

    func testRunDayArgumentsAndTolerance() {
        let run = RunnerCommand.runDay(workspace: "/w", date: "2026-09-07", provider: "claude", model: nil, mode: .deep)
        XCTAssertEqual(run.script, "run-day.mjs")
        XCTAssertEqual(run.arguments, ["--workspace", "/w", "--date", "2026-09-07", "--provider", "claude", "--mode", "deep"])
        XCTAssertTrue(run.toleratesNonZeroExit, "a partial or failed day is a result, not a crash")

        let withModel = RunnerCommand.runDay(workspace: "/w", date: "2026-09-07", provider: "codex", model: "gpt-5", mode: .noNewInput)
        XCTAssertEqual(withModel.arguments, ["--workspace", "/w", "--date", "2026-09-07", "--provider", "codex", "--model", "gpt-5", "--mode", "no_new_input"])

        let unspecified = RunnerCommand.runDay(workspace: "/w", date: "2026-09-07", provider: nil, model: nil, mode: .short)
        XCTAssertEqual(unspecified.arguments, ["--workspace", "/w", "--date", "2026-09-07", "--mode", "short"])
        XCTAssertFalse(RunnerCommand.collect(workspace: "/w").toleratesNonZeroExit)
    }

    func testExportAlwaysPassesApproveAndOptionalFlags() {
        let minimal = RunnerCommand.exportPublic(workspace: "/w", date: "2026-09-07", includeInside: false, out: nil)
        XCTAssertEqual(minimal.arguments, ["--workspace", "/w", "--date", "2026-09-07", "--approve"])
        let full = RunnerCommand.exportPublic(workspace: "/w", date: "2026-09-07", includeInside: true, out: "/repo/src/content/day.json")
        XCTAssertEqual(full.arguments, ["--workspace", "/w", "--date", "2026-09-07", "--approve", "--include-inside", "--out", "/repo/src/content/day.json"])
    }

    func testInvocationRunsNodeOnTheRepoScriptWithTheAugmentedPath() {
        let command = RunnerCommand.status(workspace: "/w", date: "2026-09-07")
        let environment = RunnerEnvironment(
            repoRoot: URL(fileURLWithPath: "/repo"),
            node: URL(fileURLWithPath: "/nvm/v22/bin/node"),
            path: "/nvm/v22/bin:/usr/bin"
        )
        let invocation = command.invocation(in: environment)
        XCTAssertEqual(invocation.executable.path, "/nvm/v22/bin/node")
        XCTAssertEqual(invocation.arguments.first, "/repo/services/runner/status.mjs")
        XCTAssertEqual(Array(invocation.arguments.dropFirst()), command.arguments)
        XCTAssertEqual(invocation.environment["PATH"], "/nvm/v22/bin:/usr/bin")
        XCTAssertNil(invocation.environment["ANTHROPIC_API_KEY"], "the app never injects a credential")
        XCTAssertEqual(invocation.workingDirectory.path, "/repo")
    }
}
