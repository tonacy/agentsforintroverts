import Foundation

public enum RunnerError: LocalizedError, Equatable, Sendable {
    case repoNotFound
    case nodeNotFound
    case workspaceNotSet
    case exit(code: Int32, stderr: String)
    case decoding(String)
    case cancelled

    public var errorDescription: String? {
        switch self {
        case .repoNotFound:
            "The repository folder was not found. Set it in Settings › Workspace."
        case .nodeNotFound:
            "Node was not found. Install it, or set its path in Settings › Workspace."
        case .workspaceNotSet:
            "Choose a workspace folder first."
        case .exit(let code, let stderr):
            stderr.isEmpty ? "The runner exited with code \(code)." : "The runner exited with code \(code): \(stderr)"
        case .decoding(let detail):
            "The runner answered in an unexpected shape: \(detail)"
        case .cancelled:
            "Stopped."
        }
    }
}

public struct RunnerOutput: Sendable {
    public let stdout: Data
    public let exitCode: Int32
    public let stderrTail: String

    public init(stdout: Data, exitCode: Int32, stderrTail: String) {
        self.stdout = stdout
        self.exitCode = exitCode
        self.stderrTail = stderrTail
    }
}

/// The one seam between the app and the runner. Stdout is the answer; stderr
/// is only kept as a tail for an error message.
public protocol RunnerBridge: Sendable {
    func run(_ command: RunnerCommand, in environment: RunnerEnvironment) async throws -> RunnerOutput
}

/// Launches `node` on a runner script. Cancelling the task terminates the
/// process.
public struct ProcessRunnerBridge: RunnerBridge {
    public init() {}

    public func run(_ command: RunnerCommand, in environment: RunnerEnvironment) async throws -> RunnerOutput {
        let invocation = command.invocation(in: environment)
        let process = Process()
        process.executableURL = invocation.executable
        process.arguments = invocation.arguments
        process.environment = invocation.environment
        process.currentDirectoryURL = invocation.workingDirectory

        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        process.standardInput = FileHandle.nullDevice

        let box = ProcessBox(process: process)

        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<RunnerOutput, Error>) in
                process.terminationHandler = { finished in
                    let outData = stdout.fileHandleForReading.readDataToEndOfFile()
                    let errData = stderr.fileHandleForReading.readDataToEndOfFile()
                    let errText = String(decoding: errData, as: UTF8.self)
                    let tail = errText.split(separator: "\n").suffix(6).joined(separator: "\n")
                    let code = finished.terminationStatus
                    if finished.terminationReason == .uncaughtSignal {
                        continuation.resume(throwing: RunnerError.cancelled)
                        return
                    }
                    if code != 0 && !command.toleratesNonZeroExit {
                        continuation.resume(throwing: RunnerError.exit(code: code, stderr: tail))
                        return
                    }
                    continuation.resume(returning: RunnerOutput(stdout: outData, exitCode: code, stderrTail: tail))
                }
                do {
                    try process.run()
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        } onCancel: {
            box.terminate()
        }
    }
}

/// `Process` is not Sendable; this wrapper only ever forwards `terminate`.
private final class ProcessBox: @unchecked Sendable {
    let process: Process
    init(process: Process) { self.process = process }
    func terminate() {
        if process.isRunning { process.terminate() }
    }
}

/// Canned answers keyed by `RunnerCommand.name`, for tests and previews.
public actor StubRunnerBridge: RunnerBridge {
    public struct Missing: LocalizedError, Sendable {
        public let name: String
        public var errorDescription: String? { "No stub response for \(name)." }
    }

    private var responses: [String: String]
    private var exitCodes: [String: Int32] = [:]
    public private(set) var calls: [RunnerCommand] = []

    public init(responses: [String: String]) {
        self.responses = responses
    }

    public func set(response: String, for name: String) {
        responses[name] = response
    }

    public func set(exitCode: Int32, for name: String) {
        exitCodes[name] = exitCode
    }

    public func run(_ command: RunnerCommand, in environment: RunnerEnvironment) async throws -> RunnerOutput {
        calls.append(command)
        guard let response = responses[command.name] else {
            throw Missing(name: command.name)
        }
        let code = exitCodes[command.name] ?? 0
        if code != 0 && !command.toleratesNonZeroExit {
            throw RunnerError.exit(code: code, stderr: "")
        }
        return RunnerOutput(stdout: Data(response.utf8), exitCode: code, stderrTail: "")
    }
}
