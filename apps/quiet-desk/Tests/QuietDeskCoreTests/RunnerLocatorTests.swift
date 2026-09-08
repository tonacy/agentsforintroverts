import XCTest
@testable import QuietDeskCore

final class RunnerLocatorTests: XCTestCase {
    private var temp: URL!

    override func setUpWithError() throws {
        temp = FileManager.default.temporaryDirectory
            .appendingPathComponent("quiet-desk-locator-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: temp, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: temp)
    }

    private func makeRepo(at root: URL) throws {
        let runner = root.appendingPathComponent("services/runner", isDirectory: true)
        try FileManager.default.createDirectory(at: runner, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: runner.appendingPathComponent("run-day.mjs").path, contents: Data())
    }

    func testEnvironmentOverrideWinsWhenItIsARepo() throws {
        let repo = temp.appendingPathComponent("repo")
        try makeRepo(at: repo)
        let found = RunnerLocator.findRepoRoot(
            environment: ["QUIET_DESK_REPO": repo.path],
            overridePath: nil,
            startingAt: "/nowhere/at/all.swift"
        )
        XCTAssertEqual(found?.standardizedFileURL, repo.standardizedFileURL)
    }

    func testOverridePathIsUsedWhenTheEnvironmentIsSilent() throws {
        let repo = temp.appendingPathComponent("override-repo")
        try makeRepo(at: repo)
        let found = RunnerLocator.findRepoRoot(environment: [:], overridePath: repo.path, startingAt: "/nowhere.swift")
        XCTAssertEqual(found?.standardizedFileURL, repo.standardizedFileURL)
    }

    func testAnOverrideThatIsNotARepoIsIgnored() throws {
        let notRepo = temp.appendingPathComponent("plain")
        try FileManager.default.createDirectory(at: notRepo, withIntermediateDirectories: true)
        XCTAssertNil(RunnerLocator.findRepoRoot(environment: [:], overridePath: notRepo.path, startingAt: "/nowhere.swift"))
    }

    func testWalksUpFromASourceFileUntilItFindsTheRunner() throws {
        let repo = temp.appendingPathComponent("walk-repo")
        try makeRepo(at: repo)
        let deep = repo.appendingPathComponent("apps/quiet-desk/Sources/QuietDeskCore", isDirectory: true)
        try FileManager.default.createDirectory(at: deep, withIntermediateDirectories: true)
        let sourceFile = deep.appendingPathComponent("Something.swift").path
        let found = RunnerLocator.findRepoRoot(environment: [:], overridePath: nil, startingAt: sourceFile)
        XCTAssertEqual(found?.standardizedFileURL, repo.standardizedFileURL)
    }

    func testPicksTheHighestNVMNodeVersion() throws {
        let home = temp.appendingPathComponent("home")
        for version in ["v18.20.4", "v22.23.2", "v22.9.0", "v9.11.2"] {
            let bin = home.appendingPathComponent(".nvm/versions/node/\(version)/bin", isDirectory: true)
            try FileManager.default.createDirectory(at: bin, withIntermediateDirectories: true)
            FileManager.default.createFile(atPath: bin.appendingPathComponent("node").path, contents: Data())
        }
        let node = RunnerLocator.findNode(home: home, overridePath: nil, systemCandidates: [])
        XCTAssertEqual(node?.path, home.appendingPathComponent(".nvm/versions/node/v22.23.2/bin/node").path)
    }

    func testNodeOverrideWinsAndSystemCandidatesAreTheFallback() throws {
        let home = temp.appendingPathComponent("home2")
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        let custom = temp.appendingPathComponent("custom-node")
        FileManager.default.createFile(atPath: custom.path, contents: Data())
        XCTAssertEqual(RunnerLocator.findNode(home: home, overridePath: custom.path, systemCandidates: []), custom)

        let system = temp.appendingPathComponent("system-node")
        FileManager.default.createFile(atPath: system.path, contents: Data())
        XCTAssertEqual(RunnerLocator.findNode(home: home, overridePath: nil, systemCandidates: [system]), system)
        XCTAssertNil(RunnerLocator.findNode(home: home, overridePath: nil, systemCandidates: []))
    }

    func testAugmentedPathPutsNodeAndUserBinsFirst() {
        let home = URL(fileURLWithPath: "/Users/x")
        let path = RunnerLocator.augmentedPath(
            home: home,
            nodeBinDirectory: URL(fileURLWithPath: "/Users/x/.nvm/versions/node/v22.23.2/bin"),
            basePath: "/usr/bin:/bin"
        )
        let parts = path.split(separator: ":").map(String.init)
        XCTAssertEqual(parts.first, "/Users/x/.nvm/versions/node/v22.23.2/bin")
        XCTAssertTrue(parts.contains("/Users/x/.local/bin"))
        XCTAssertTrue(parts.contains("/opt/homebrew/bin"))
        XCTAssertTrue(parts.contains("/usr/local/bin"))
        XCTAssertEqual(parts.suffix(2), ["/usr/bin", "/bin"])
        XCTAssertEqual(Set(parts).count, parts.count, "no duplicate entries")
    }
}
