import CryptoKit
import XCTest
@testable import QuietDeskCore

final class DeskCaptureTests: XCTestCase {
    private var root: URL!
    private var clock: Date!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        for folder in ["context", "preferences"] {
            try FileManager.default.createDirectory(at: root.appendingPathComponent(folder), withIntermediateDirectories: true)
        }
        clock = ISO8601DateFormatter().date(from: "2026-09-23T09:41:05Z")!
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private func store() -> DeskCaptureStore {
        let now = clock!
        return DeskCaptureStore(workspace: root, now: { now }, timeZone: TimeZone(identifier: "UTC")!)
    }

    func testACaptureKeepsTheWordsVerbatimAndSaysWhoWroteThem() throws {
        let words = "  The reconnect bug finally makes sense:\nthe transcript was never the problem.  "
        let capture = try XCTUnwrap(store().capture(text: words).first)
        XCTAssertEqual(capture.path, "captures/2026-09-23/094105-the-reconnect-bug-finally-makes.md")
        XCTAssertEqual(capture.kind, .note)
        XCTAssertEqual(capture.status, .loose)
        let file = try String(contentsOf: root.appendingPathComponent(capture.path), encoding: .utf8)
        XCTAssertTrue(file.hasPrefix("---\nid: capture_20260923_094105_"))
        XCTAssertTrue(file.contains("\nauthor: human\n"))
        XCTAssertTrue(file.contains("\nsource_kind: quick_note\n"))
        XCTAssertTrue(file.contains("\nstatus: loose\n"))
        XCTAssertTrue(file.hasSuffix("\n---\n\nThe reconnect bug finally makes sense:\nthe transcript was never the problem.\n"))
        XCTAssertEqual(capture.text, "The reconnect bug finally makes sense:\nthe transcript was never the problem.")
    }

    func testCapturesNeverOverwriteAndListNewestFirst() throws {
        let desk = store()
        let first = try XCTUnwrap(desk.capture(text: "Same second").first)
        let second = try XCTUnwrap(desk.capture(text: "Same second").first)
        XCTAssertNotEqual(first.path, second.path)
        XCTAssertTrue(second.path.hasSuffix("-2.md"))
        clock = clock.addingTimeInterval(60)
        let later = try XCTUnwrap(store().capture(text: "A minute later").first)
        let listed = try store().list()
        XCTAssertEqual(listed.map(\.path), [later.path, second.path, first.path])
        XCTAssertEqual(try String(contentsOf: root.appendingPathComponent(first.path), encoding: .utf8).components(separatedBy: "\n").last(where: { !$0.isEmpty }), "Same second")
    }

    func testAnEmptyCaptureIsRefused() {
        XCTAssertThrowsError(try store().capture(text: " \n\t ")) { error in
            XCTAssertEqual(error as? DeskCaptureError, .empty)
        }
    }

    func testALoneLinkIsALinkAndADroppedFileIsCopiedBesideIt() throws {
        let link = try XCTUnwrap(store().capture(text: "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion").first)
        XCTAssertEqual(link.kind, .link)
        XCTAssertEqual(link.url?.host, "developer.mozilla.org")

        let outside = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString)-sketch.png")
        try Data([0x89, 0x50, 0x4E, 0x47]).write(to: outside)
        defer { try? FileManager.default.removeItem(at: outside) }
        let captures = try store().capture(text: "The sea parts here", attachments: [outside])
        XCTAssertEqual(captures.count, 1)
        let image = try XCTUnwrap(captures.first)
        XCTAssertEqual(image.kind, .image)
        XCTAssertEqual(image.text, "The sea parts here")
        let copied = try XCTUnwrap(image.attachment)
        XCTAssertTrue(copied.hasPrefix("captures/2026-09-23/files/094105-"))
        XCTAssertEqual(try Data(contentsOf: root.appendingPathComponent(copied)), Data([0x89, 0x50, 0x4E, 0x47]))
        XCTAssertTrue(FileManager.default.fileExists(atPath: outside.path), "the original stays where it was")
    }

    func testSettingAsideKeepsTheWordsAndTakesItOffTheDesk() throws {
        let capture = try XCTUnwrap(store().capture(text: "Not today").first)
        try store().setAside(capture)
        let listed = try XCTUnwrap(store().list().first)
        XCTAssertEqual(listed.status, .setAside)
        XCTAssertEqual(listed.text, "Not today")
        XCTAssertEqual(try store().list().filter { $0.status == .loose }.count, 0)
    }

    func testGatheredCapturesAreTheOnesWorkAlreadyPointsTo() throws {
        let kept = try XCTUnwrap(store().capture(text: "Used in a piece").first)
        clock = clock.addingTimeInterval(1)
        let loose = try XCTUnwrap(store().capture(text: "Still loose").first)
        let references: Set<String> = [kept.path, "notes/agent/elsewhere.md"]
        XCTAssertTrue(kept.isGathered(by: references))
        XCTAssertFalse(loose.isGathered(by: references))
    }
}

final class PieceLibraryTests: XCTestCase {
    private var root: URL!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        for folder in ["context", "preferences", "drafts"] {
            try FileManager.default.createDirectory(at: root.appendingPathComponent(folder), withIntermediateDirectories: true)
        }
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    @discardableResult
    private func piece(_ folder: String, manifest: String, files: [String: String]) throws -> URL {
        let dir = root.appendingPathComponent("drafts/\(folder)")
        try FileManager.default.createDirectory(at: dir.appendingPathComponent("adaptations"), withIntermediateDirectories: true)
        try manifest.write(to: dir.appendingPathComponent("piece.json"), atomically: true, encoding: .utf8)
        for (name, text) in files {
            let file = dir.appendingPathComponent(name)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try text.write(to: file, atomically: true, encoding: .utf8)
        }
        return dir
    }

    private let prototype = #"""
    {"schema":"afi.piece.prototype.v1","id":"kit-conversation-that-stays","revision":1,"status":"draft_for_review","project":"Kit","title":"A conversation that stays","created_at":"2026-09-11","updated_at":"2026-09-11","authored_by":"Codex","reviewer":"Tony","human_approved":false,"publication_urls":[],"canonical_text":"article.md","experience":"index.html","adaptations":[{"channel":"Substack","path":"adaptations/substack.md","based_on_revision":1,"status":"draft","approved":false},{"channel":"LinkedIn","path":"adaptations/linkedin.md","based_on_revision":1,"status":"draft","approved":false}],"limits":["Same authorized session required."]}
    """#

    private let specimen = #"""
    {"schema":"afi.piece.v1","id":"specimen","revision":2,"project":"Agents for Introverts","kicker":"From the workbench","title":"Why this page *slows down*","deck":"It settles at the speed of reading.","created_at":"2026-09-20","updated_at":"2026-09-23","canonical_text":"article.md","adaptations":[{"channel":"X","path":"adaptations/x.md"}],"captures":["captures/2026-09-23/094105-voice.md"],"ledger":{"person":["the idea"],"agents":["the figure"]}}
    """#

    private func files(_ extra: [String: String] = [:]) -> [String: String] {
        ["article.md": "# Title\n\nWords.\n", "adaptations/substack.md": "Long form.", "adaptations/linkedin.md": "Short form.", "adaptations/x.md": "Shortest."]
            .merging(extra) { $1 }
    }

    func testReadsBothManifestGenerationsNewestFirst() throws {
        try piece("2026-09-11-a-conversation", manifest: prototype, files: files(["index.html": "<p>hand-built</p>"]))
        try piece("2026-09-23-specimen", manifest: specimen, files: files(["cards/link.html": "<p>card</p>"]))
        let result = try PieceLibrary(workspace: root).pieces()
        XCTAssertTrue(result.problems.isEmpty)
        XCTAssertEqual(result.pieces.map(\.id), ["specimen", "kit-conversation-that-stays"])

        let kit = try XCTUnwrap(result.pieces.last)
        XCTAssertEqual(kit.title, "A conversation that stays")
        XCTAssertEqual(kit.forms.map(\.key), ["web", "substack", "linkedin"])
        XCTAssertEqual(kit.forms.map(\.channel), ["Essay", "Substack", "LinkedIn"])
        XCTAssertEqual(kit.experience, "index.html")
        XCTAssertTrue(kit.forms.allSatisfy { $0.state == .draft })

        let spec = try XCTUnwrap(result.pieces.first)
        XCTAssertEqual(spec.title, "Why this page slows down")
        XCTAssertEqual(spec.rawTitle, "Why this page *slows down*")
        XCTAssertEqual(spec.revision, 2)
        XCTAssertEqual(spec.cards.map(\.name), ["link"])
        XCTAssertEqual(spec.captures, ["captures/2026-09-23/094105-voice.md"])
        XCTAssertEqual(spec.ledgerPerson, ["the idea"])
    }

    func testAMalformedPieceIsReportedWithoutHidingTheOthers() throws {
        try piece("broken", manifest: "{ not json", files: [:])
        try piece("fine", manifest: specimen, files: files())
        let result = try PieceLibrary(workspace: root).pieces()
        XCTAssertEqual(result.pieces.map(\.id), ["specimen"])
        XCTAssertEqual(result.problems.count, 1)
        XCTAssertTrue(result.problems[0].contains("broken"))
    }

    func testASignatureCoversTheExactBytesAndAnyEditUnsignsIt() throws {
        let dir = try piece("fine", manifest: specimen, files: files())
        let library = PieceLibrary(workspace: root, now: { ISO8601DateFormatter().date(from: "2026-09-23T10:00:00Z")! })
        var spec = try XCTUnwrap(library.pieces().pieces.first)
        spec = try library.sign(formKey: "web", of: spec)
        guard case .signed(_, let digest) = spec.form("web")?.state else { return XCTFail("expected a signature") }
        let bytes = try Data(contentsOf: dir.appendingPathComponent("article.md"))
        XCTAssertEqual(digest, SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined())

        let record = try JSONSerialization.jsonObject(with: Data(contentsOf: dir.appendingPathComponent("approvals/web.json"))) as? [String: Any]
        XCTAssertEqual(record?["approved_by"] as? String, "human")
        XCTAssertEqual(record?["form"] as? String, "web")
        XCTAssertEqual(record?["revision"] as? Int, 2)
        XCTAssertEqual(record?["payload_sha256"] as? String, digest)
        XCTAssertEqual(spec.form("x")?.state, .draft, "signing one form does not sign another")

        try "# Title\n\nWords, edited.\n".write(to: dir.appendingPathComponent("article.md"), atomically: true, encoding: .utf8)
        XCTAssertEqual(try library.pieces().pieces.first?.form("web")?.state, .changedSinceSigned)
    }

    func testPublicationNeedsAValidSignatureAndAnHttpsLink() throws {
        let dir = try piece("fine", manifest: specimen, files: files())
        let library = PieceLibrary(workspace: root)
        var spec = try XCTUnwrap(library.pieces().pieces.first)
        XCTAssertThrowsError(try library.recordPublication(formKey: "x", of: spec, url: "https://x.com/someone/status/1")) { error in
            XCTAssertEqual(error as? PieceLibraryError, .notSigned)
        }
        spec = try library.sign(formKey: "x", of: spec)
        for bad in ["http://x.com/a", "https://user:pw@x.com/a", "javascript:alert(1)", "not a url"] {
            XCTAssertThrowsError(try library.recordPublication(formKey: "x", of: spec, url: bad)) { error in
                XCTAssertEqual(error as? PieceLibraryError, .unsafeURL, bad)
            }
        }
        spec = try library.recordPublication(formKey: "x", of: spec, url: "https://x.com/someone/status/1")
        guard case .published(let url, _) = spec.form("x")?.state else { return XCTFail("expected a publication") }
        XCTAssertEqual(url.absoluteString, "https://x.com/someone/status/1")
        let receipt = try JSONSerialization.jsonObject(with: Data(contentsOf: dir.appendingPathComponent("receipts/x.json"))) as? [String: Any]
        XCTAssertEqual(receipt?["schema"] as? String, "afi.publication_receipt.v0")
        XCTAssertEqual(receipt?["publication_mode"] as? String, "manual")
        XCTAssertEqual((receipt?["verification"] as? [String: Any])?["status"] as? String, "unverified")
        XCTAssertThrowsError(try library.withdrawSignature(formKey: "x", of: spec)) { error in
            XCTAssertEqual(error as? PieceLibraryError, .alreadyPublished)
        }
    }

    func testASignatureCanBeWithdrawnBeforePublication() throws {
        try piece("fine", manifest: specimen, files: files())
        let library = PieceLibrary(workspace: root)
        var spec = try XCTUnwrap(library.pieces().pieces.first)
        spec = try library.sign(formKey: "web", of: spec)
        spec = try library.withdrawSignature(formKey: "web", of: spec)
        XCTAssertEqual(spec.form("web")?.state, .draft)
    }

    func testManifestPathsCannotLeaveThePiece() throws {
        let escaping = specimen.replacingOccurrences(of: #""path":"adaptations/x.md""#, with: #""path":"../../context/context.md""#)
        try piece("escape", manifest: escaping, files: files())
        let spec = try XCTUnwrap(PieceLibrary(workspace: root).pieces().pieces.first)
        XCTAssertNil(spec.form("x"), "a form outside the piece is not offered for signing")
        XCTAssertNotNil(spec.form("web"))
    }
}

@MainActor
final class DeskStoreTests: XCTestCase {
    func testTheDeskShowsOnlyLoosePagesNoWorkHasGathered() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        for folder in ["context", "preferences"] {
            try FileManager.default.createDirectory(at: root.appendingPathComponent(folder), withIntermediateDirectories: true)
        }
        let desk = DeskStore()
        XCTAssertFalse(desk.capture(text: "Before a workspace"))
        XCTAssertNotNil(desk.lastError)

        desk.open(workspace: root.path)
        XCTAssertTrue(desk.capture(text: "A first thought"))
        XCTAssertTrue(desk.capture(text: "A second thought"))
        XCTAssertNotNil(desk.justCaptured)
        XCTAssertEqual(desk.loose(referencedBy: []).count, 2)

        let gathered = try XCTUnwrap(desk.captures.first { $0.text == "A first thought" })
        XCTAssertEqual(desk.loose(referencedBy: [gathered.path]).map(\.text), ["A second thought"])

        desk.setAside(try XCTUnwrap(desk.captures.first { $0.text == "A second thought" }))
        XCTAssertEqual(desk.loose(referencedBy: [gathered.path]).count, 0)
        XCTAssertEqual(desk.captures.count, 2, "setting aside keeps the page")
    }

    func testAChangeRequestIsKeptInThePersonsWordsBesideThePiece() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let dir = root.appendingPathComponent("drafts/one")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try #"{"id":"one","title":"One","revision":3,"canonical_text":"article.md"}"#.write(to: dir.appendingPathComponent("piece.json"), atomically: true, encoding: .utf8)
        try "# One\n".write(to: dir.appendingPathComponent("article.md"), atomically: true, encoding: .utf8)
        let desk = DeskStore()
        desk.open(workspace: root.path)
        let piece = try XCTUnwrap(desk.pieces.first)
        desk.requestChange("Lead with the reconnect, not the database.", for: piece)
        desk.requestChange("Shorter title.", for: piece)
        let requests = try String(contentsOf: dir.appendingPathComponent("review/requests.md"), encoding: .utf8)
        XCTAssertTrue(requests.hasPrefix("# Requests from the person\n"))
        XCTAssertTrue(requests.contains("· r3 · author: human\n\nLead with the reconnect, not the database.\n"))
        XCTAssertTrue(requests.hasSuffix("Shorter title.\n"))
    }

    func testWorkThatPointsIntoAPieceLeadsToThatPiece() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let dir = root.appendingPathComponent("drafts/2026-09-11-a-conversation")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try #"{"id":"one","title":"One","canonical_text":"article.md"}"#.write(to: dir.appendingPathComponent("piece.json"), atomically: true, encoding: .utf8)
        try "# One\n".write(to: dir.appendingPathComponent("article.md"), atomically: true, encoding: .utf8)
        let desk = DeskStore()
        desk.open(workspace: root.path)
        XCTAssertEqual(desk.piece(referencedBy: ["notes/agent/ideas.md", "drafts/2026-09-11-a-conversation/index.html"])?.id, "one")
        XCTAssertNil(desk.piece(referencedBy: ["drafts/2026-09-11-a-conversation-other/index.html", "drafts"]))
    }
}
