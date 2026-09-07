import Foundation

/// Where a runner process runs: the repository, the `node` binary, and the
/// PATH that lets the runner find the harness CLIs.
public struct RunnerEnvironment: Hashable, Sendable {
    public let repoRoot: URL
    public let node: URL
    public let path: String

    public init(repoRoot: URL, node: URL, path: String) {
        self.repoRoot = repoRoot
        self.node = node
        self.path = path
    }

    public var runnerDirectory: URL {
        repoRoot.appendingPathComponent("services/runner", isDirectory: true)
    }

    public var defaultSiteDayFile: URL {
        repoRoot.appendingPathComponent("src/content/day.json")
    }
}

/// A fully resolved process to launch.
public struct RunnerInvocation: Hashable, Sendable {
    public let executable: URL
    public let arguments: [String]
    public let environment: [String: String]
    public let workingDirectory: URL
}

/// One of the runner's commands, as pure data. Building the argument list
/// here keeps the flags in one place and lets tests pin them exactly.
public struct RunnerCommand: Hashable, Sendable {
    /// A stable key for stubs and progress labels, e.g. `providers.list`.
    public let name: String
    /// The script file under `services/runner/`.
    public let script: String
    public let arguments: [String]
    /// run-day exits non-zero for a partial or failed day; that is a result
    /// the app must read, not a crash.
    public let toleratesNonZeroExit: Bool

    public init(name: String, script: String, arguments: [String], toleratesNonZeroExit: Bool = false) {
        self.name = name
        self.script = script
        self.arguments = arguments
        self.toleratesNonZeroExit = toleratesNonZeroExit
    }

    public static func listProviders(workspace: String?) -> RunnerCommand {
        var arguments = ["list", "--json"]
        if let workspace { arguments += ["--workspace", workspace] }
        return RunnerCommand(name: "providers.list", script: "providers.mjs", arguments: arguments)
    }

    public static func useProvider(workspace: String, provider: String, model: String?) -> RunnerCommand {
        var arguments = ["use", "--workspace", workspace, "--provider", provider]
        if let model, !model.isEmpty { arguments += ["--model", model] }
        arguments.append("--json")
        return RunnerCommand(name: "providers.use", script: "providers.mjs", arguments: arguments)
    }

    public static func status(workspace: String, date: String) -> RunnerCommand {
        RunnerCommand(name: "status", script: "status.mjs", arguments: ["--workspace", workspace, "--date", date, "--json"])
    }

    public static func newCapture(workspace: String, date: String) -> RunnerCommand {
        RunnerCommand(name: "capture.new", script: "capture.mjs", arguments: ["new", "--workspace", workspace, "--date", date, "--json"])
    }

    public static func collect(workspace: String) -> RunnerCommand {
        RunnerCommand(name: "collect", script: "collect.mjs", arguments: ["--workspace", workspace, "--json"])
    }

    public static func runDay(
        workspace: String,
        date: String,
        provider: String?,
        model: String?,
        mode: DailyConversationMode
    ) -> RunnerCommand {
        var arguments = ["--workspace", workspace, "--date", date]
        if let provider, !provider.isEmpty { arguments += ["--provider", provider] }
        if let model, !model.isEmpty { arguments += ["--model", model] }
        arguments += ["--mode", mode.rawValue]
        return RunnerCommand(name: "run-day", script: "run-day.mjs", arguments: arguments, toleratesNonZeroExit: true)
    }

    /// `--approve` is always present: calling this is the approval.
    public static func exportPublic(workspace: String, date: String, includeInside: Bool, out: String?) -> RunnerCommand {
        var arguments = ["--workspace", workspace, "--date", date, "--approve"]
        if includeInside { arguments.append("--include-inside") }
        if let out, !out.isEmpty { arguments += ["--out", out] }
        return RunnerCommand(name: "export-public", script: "export-public.mjs", arguments: arguments)
    }

    public func invocation(in environment: RunnerEnvironment, inheriting base: [String: String] = ProcessInfo.processInfo.environment) -> RunnerInvocation {
        // The app never injects a credential. It only passes PATH through so
        // the runner can find the signed-in CLIs.
        var env = base
        env["PATH"] = environment.path
        env.removeValue(forKey: "ANTHROPIC_API_KEY")
        env.removeValue(forKey: "ANTHROPIC_AUTH_TOKEN")
        if let home = base["HOME"] { env["HOME"] = home }
        return RunnerInvocation(
            executable: environment.node,
            arguments: [environment.runnerDirectory.appendingPathComponent(script).path] + arguments,
            environment: env,
            workingDirectory: environment.repoRoot
        )
    }
}
