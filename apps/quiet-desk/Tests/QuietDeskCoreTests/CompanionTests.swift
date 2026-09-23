import XCTest
@testable import QuietDeskCore

@MainActor
final class CompanionTests: XCTestCase {
    func testHandoffAndSaveStateSurviveRefreshAndClearOnWorkspaceChange() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        for folder in ["context", "preferences"] {
            try FileManager.default.createDirectory(at: root.appendingPathComponent(folder), withIntermediateDirectories: true)
        }
        let state = #"{"thread_id":"conversation","revision":"one","summary":"Saved understanding","open_questions":["What next?"],"updated_at":"2026-09-09T16:00:00Z","synced_at":null,"sync_error":null,"updates":[],"url":"codex://threads/conversation"}"#
        let bridge = StubRunnerBridge(responses: ["companion.open": state, "companion.status": state])
        let store = ProviderStore(bridge: bridge, defaults: nil, environmentProvider: {
            RunnerEnvironment(repoRoot: root, node: URL(fileURLWithPath: "/node"), path: "/bin")
        })
        store.workspacePath = root.path
        let link = await store.prepareCodexConversation()
        XCTAssertEqual(link?.absoluteString, "codex://threads/conversation")
        await store.refreshCompanion()
        XCTAssertEqual(store.companion?.summary, "Saved understanding")
        XCTAssertEqual(store.companion?.openQuestions, ["What next?"])
        store.workspacePath = nil
        XCTAssertNil(store.companion)
        await store.setWorkspace(path: root.path)
        XCTAssertEqual(store.companion?.summary, "Saved understanding")
        XCTAssertNil(store.lastError)
    }

    func testLegacyAndStructuredCheckpointsDecodeWithoutInventingWorkItems() throws {
        let legacy = #"{"revision":"0","summary":"An old narrative","open_questions":[],"updates":[]}"#
        let old = try RunnerJSON.decode(CompanionState.self, from: Data(legacy.utf8))
        XCTAssertNil(old.workItems)
        XCTAssertNil(old.latestDecision)
        let structured = #"{"revision":"1","open_questions":[],"updates":[],"work_items":[{"id":"stable","project":"Kit","title":"A long title that stays available in the detail view without losing its stable identity","state":"Three ideas; none selected","preview":[{"heading":"An idea","text":"A grounded preview"}],"notes":"Details","evidence":"Workspace notes","message_ids":[],"sources":[]}],"latest_decision":{"text":"Direction chosen","work_item_id":"stable"}}"#
        let current = try RunnerJSON.decode(CompanionState.self, from: Data(structured.utf8))
        XCTAssertEqual(current.workItems?.first?.id, "stable")
        XCTAssertEqual(current.workItems?.first?.state, "Three ideas; none selected")
        XCTAssertEqual(current.latestDecision?.workItemId, "stable")
        XCTAssertNil(current.workItems?.first?.imagePath)
    }

    func testWorkSourcesRefuseExecutableURLsAndWorkspaceEscapes() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let note = root.appendingPathComponent("note.md")
        try "Source".write(to: note, atomically: true, encoding: .utf8)
        XCTAssertEqual(CompanionWorkSource(label: "Note", path: "note.md", url: nil).destination(workspace: root.path)?.path, note.resolvingSymlinksInPath().path)
        XCTAssertNil(CompanionWorkSource(label: "Bad", path: "../outside.md", url: nil).destination(workspace: root.path))
        XCTAssertNil(CompanionWorkSource(label: "Bad", path: nil, url: "file:///Applications/Terminal.app").destination(workspace: root.path))
        XCTAssertNil(CompanionWorkSource(label: "Bad", path: nil, url: "https://user:secret@example.com").destination(workspace: root.path))
        XCTAssertEqual(CompanionWorkSource(label: "Web", path: nil, url: "https://example.com/work").destination(workspace: root.path)?.host, "example.com")
    }

    func testProcessBridgeDrainsLargeOutputAndErrorWithoutWaitingForExit() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let scripts = root.appendingPathComponent("services/runner")
        try FileManager.default.createDirectory(at: scripts, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let script = """
        /usr/bin/awk 'BEGIN { for (i=0;i<100000;i++) printf "x"; }'
        /usr/bin/awk 'BEGIN { for (i=0;i<100000;i++) printf "y"; }' >&2
        """
        try script.write(to: scripts.appendingPathComponent("large.sh"), atomically: true, encoding: .utf8)
        let result = try await ProcessRunnerBridge().run(
            RunnerCommand(name: "large", script: "large.sh", arguments: []),
            in: RunnerEnvironment(repoRoot: root, node: URL(fileURLWithPath: "/bin/sh"), path: "/usr/bin:/bin")
        )
        XCTAssertEqual(result.stdout.count, 100000)
        XCTAssertEqual(result.stderrTail.count, 100000)
        XCTAssertEqual(result.exitCode, 0)
    }
}
