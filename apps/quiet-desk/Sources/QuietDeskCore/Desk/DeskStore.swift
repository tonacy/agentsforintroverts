import Foundation
import Observation

/// What is on the Desk right now: the person's loose pages and the pieces the
/// work has become. Everything is read back from the workspace after each
/// change, so the files stay the source of truth.
@MainActor
@Observable
public final class DeskStore {
    public private(set) var captures: [DeskCapture] = []
    public private(set) var pieces: [Piece] = []
    public private(set) var problems: [String] = []
    public private(set) var lastError: String?
    /// The page that just landed, so the Desk can let it drop in.
    public private(set) var justCaptured: String?

    private var workspace: URL?
    private let now: @Sendable () -> Date

    public init(now: @escaping @Sendable () -> Date = { Date() }) {
        self.now = now
    }

    public var hasWorkspace: Bool { workspace != nil }
    public var workspaceURL: URL? { workspace }

    /// Loose pages that no work or piece points at yet.
    public func loose(referencedBy references: Set<String>) -> [DeskCapture] {
        let fromPieces = Set(pieces.flatMap(\.captures))
        return captures.filter { $0.status == .loose && !$0.isGathered(by: references.union(fromPieces)) }
    }

    public func open(workspace path: String?) {
        workspace = path.map { URL(fileURLWithPath: $0, isDirectory: true) }
        justCaptured = nil
        refresh()
    }

    public func refresh() {
        guard let workspace else {
            captures = []
            pieces = []
            problems = []
            return
        }
        do {
            captures = try DeskCaptureStore(workspace: workspace, now: now).list()
            let scan = try PieceLibrary(workspace: workspace, now: now).pieces()
            pieces = scan.pieces
            problems = scan.problems
        } catch {
            lastError = error.localizedDescription
        }
    }

    @discardableResult
    public func capture(text: String, attachments: [URL] = []) -> Bool {
        guard let workspace else {
            lastError = "Choose a Desk folder in Settings before putting anything on it."
            return false
        }
        do {
            let written = try DeskCaptureStore(workspace: workspace, now: now).capture(text: text, attachments: attachments)
            lastError = nil
            refresh()
            justCaptured = written.first?.path
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    public func setAside(_ capture: DeskCapture) {
        guard let workspace else { return }
        perform { try DeskCaptureStore(workspace: workspace, now: now).setAside(capture) }
    }

    public func piece(folder: String) -> Piece? {
        pieces.first { $0.folder == folder }
    }

    /// The piece a work item's sources point into, if any.
    public func piece(referencedBy paths: [String]) -> Piece? {
        pieces.first { piece in paths.contains { $0.hasPrefix(piece.folder + "/") } }
    }

    public func sign(_ formKey: String, of piece: Piece) {
        library { try $0.sign(formKey: formKey, of: piece) }
    }

    public func withdrawSignature(_ formKey: String, of piece: Piece) {
        library { try $0.withdrawSignature(formKey: formKey, of: piece) }
    }

    @discardableResult
    public func recordPublication(_ formKey: String, of piece: Piece, url: String) -> Bool {
        library { try $0.recordPublication(formKey: formKey, of: piece, url: url) }
        return lastError == nil
    }

    /// A change the person asks for, kept in their words beside the piece.
    public func requestChange(_ words: String, for piece: Piece) {
        guard let workspace else { return }
        let text = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        perform {
            let file = workspace.appendingPathComponent(piece.folder).appendingPathComponent("review/requests.md")
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let stamp = ISO8601DateFormatter().string(from: now())
            let entry = "\n## \(stamp) · r\(piece.revision) · author: human\n\n\(text)\n"
            if let handle = try? FileHandle(forWritingTo: file) {
                defer { try? handle.close() }
                try handle.seekToEnd()
                try handle.write(contentsOf: Data(entry.utf8))
            } else {
                try Data(("# Requests from the person\n" + entry).utf8).write(to: file, options: .withoutOverwriting)
            }
        }
    }

    public func clearError() {
        lastError = nil
    }

    private func library(_ work: (PieceLibrary) throws -> Piece) {
        guard let workspace else { return }
        do {
            _ = try work(PieceLibrary(workspace: workspace, now: now))
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
        refresh()
    }

    private func perform(_ work: () throws -> Void) {
        do {
            try work()
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
        refresh()
    }
}
