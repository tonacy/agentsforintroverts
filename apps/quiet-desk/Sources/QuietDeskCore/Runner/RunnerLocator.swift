import Foundation

/// Where the runner and `node` live on this Mac. A GUI app launches without
/// the shell's PATH, so the search is explicit and the result is passed to
/// every process as an augmented PATH.
public enum RunnerLocator {
    public static let runnerRelativePath = "services/runner/run-day.mjs"
    public static let environmentKey = "QUIET_DESK_REPO"

    public static let defaultSystemNodeCandidates: [URL] = [
        URL(fileURLWithPath: "/opt/homebrew/bin/node"),
        URL(fileURLWithPath: "/usr/local/bin/node"),
    ]

    public static func isRepoRoot(_ url: URL, fileManager: FileManager = .default) -> Bool {
        fileManager.fileExists(atPath: url.appendingPathComponent(runnerRelativePath).path)
    }

    /// Environment override, then a user-chosen path, then walking up from a
    /// source file until the runner is found. Returns nil when none applies.
    public static func findRepoRoot(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        overridePath: String?,
        startingAt sourceFile: String = #filePath,
        fileManager: FileManager = .default
    ) -> URL? {
        if let fromEnvironment = environment[environmentKey], !fromEnvironment.isEmpty {
            let url = URL(fileURLWithPath: fromEnvironment, isDirectory: true)
            if isRepoRoot(url, fileManager: fileManager) { return url }
        }

        if let overridePath, !overridePath.isEmpty {
            let url = URL(fileURLWithPath: overridePath, isDirectory: true)
            if isRepoRoot(url, fileManager: fileManager) { return url }
        }

        var current = URL(fileURLWithPath: sourceFile).deletingLastPathComponent()
        while current.path != "/" && !current.path.isEmpty {
            if isRepoRoot(current, fileManager: fileManager) { return current }
            let parent = current.deletingLastPathComponent()
            if parent.path == current.path { break }
            current = parent
        }
        return nil
    }

    /// A user override, then the newest nvm install, then the usual system
    /// locations.
    public static func findNode(
        home: URL = FileManager.default.homeDirectoryForCurrentUser,
        overridePath: String?,
        systemCandidates: [URL] = defaultSystemNodeCandidates,
        fileManager: FileManager = .default
    ) -> URL? {
        if let overridePath, !overridePath.isEmpty, fileManager.isExecutableFile(atPath: overridePath) || fileManager.fileExists(atPath: overridePath) {
            return URL(fileURLWithPath: overridePath)
        }

        if let nvm = highestNVMNode(home: home, fileManager: fileManager) {
            return nvm
        }

        return systemCandidates.first { fileManager.fileExists(atPath: $0.path) }
    }

    static func highestNVMNode(home: URL, fileManager: FileManager) -> URL? {
        let versions = home.appendingPathComponent(".nvm/versions/node", isDirectory: true)
        guard let names = try? fileManager.contentsOfDirectory(atPath: versions.path) else { return nil }

        let candidates = names.compactMap { name -> (parts: [Int], url: URL)? in
            let trimmed = name.hasPrefix("v") ? String(name.dropFirst()) : name
            let parts = trimmed.split(separator: ".").compactMap { Int($0) }
            guard !parts.isEmpty else { return nil }
            let node = versions.appendingPathComponent(name).appendingPathComponent("bin/node")
            guard fileManager.fileExists(atPath: node.path) else { return nil }
            return (parts, node)
        }

        return candidates.max { lhs, rhs in
            lhs.parts.lexicographicallyPrecedes(rhs.parts)
        }?.url
    }

    /// The PATH handed to every runner process: node's own bin first, then the
    /// places the harness CLIs usually live, then whatever the app inherited.
    public static func augmentedPath(
        home: URL = FileManager.default.homeDirectoryForCurrentUser,
        nodeBinDirectory: URL?,
        basePath: String? = ProcessInfo.processInfo.environment["PATH"]
    ) -> String {
        var entries: [String] = []
        if let nodeBinDirectory { entries.append(nodeBinDirectory.path) }
        entries.append(home.appendingPathComponent(".local/bin").path)
        entries.append("/opt/homebrew/bin")
        entries.append("/usr/local/bin")
        entries.append(contentsOf: (basePath ?? "/usr/bin:/bin").split(separator: ":").map(String.init))

        var seen = Set<String>()
        return entries.filter { seen.insert($0).inserted }.joined(separator: ":")
    }

    /// Resolves everything a process needs, or explains what is missing.
    public static func environment(
        repoOverride: String?,
        nodeOverride: String?,
        fileManager: FileManager = .default
    ) throws -> RunnerEnvironment {
        guard let repoRoot = findRepoRoot(overridePath: repoOverride, fileManager: fileManager) else {
            throw RunnerError.repoNotFound
        }
        guard let node = findNode(overridePath: nodeOverride, fileManager: fileManager) else {
            throw RunnerError.nodeNotFound
        }
        return RunnerEnvironment(
            repoRoot: repoRoot,
            node: node,
            path: augmentedPath(nodeBinDirectory: node.deletingLastPathComponent())
        )
    }
}
