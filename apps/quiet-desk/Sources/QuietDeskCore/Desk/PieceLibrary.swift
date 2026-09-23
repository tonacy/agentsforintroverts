import CryptoKit
import Foundation

/// Where one form of a piece stands. Derived from files on disk every time,
/// never from a status word an agent wrote: a signature counts only while
/// its hash still matches the exact bytes, and a publication only with a
/// receipt for those same bytes.
public enum FormState: Hashable, Sendable {
    case draft
    case signed(at: Date, sha256: String)
    case changedSinceSigned
    case published(url: URL, at: Date)

    public var isSigned: Bool {
        if case .signed = self { return true }
        return false
    }
}

/// One of the shapes a piece takes: the essay, or a channel adaptation.
public struct PieceForm: Identifiable, Hashable, Sendable {
    public var id: String { key }
    /// `web` for the essay; otherwise the channel, lowercased.
    public let key: String
    public let channel: String
    /// Relative to the piece folder.
    public let path: String
    public let state: FormState
}

/// A rendered social card, ready to rasterize.
public struct PieceCard: Identifiable, Hashable, Sendable {
    public var id: String { name }
    public let name: String
    public let path: String
    public let width: Int
    public let height: Int
}

public struct Piece: Identifiable, Hashable, Sendable {
    public let id: String
    /// Workspace-relative folder, e.g. `drafts/2026-09-11-a-conversation`.
    public let folder: String
    public let title: String
    /// The title as written, which may italicize a phrase with `*…*`.
    public let rawTitle: String
    public let project: String?
    public let kicker: String?
    public let deck: String?
    public let revision: Int
    public let updatedAt: String?
    public let authoredBy: String?
    public let reviewer: String?
    public let forms: [PieceForm]
    public let cards: [PieceCard]
    /// The reader page, relative to the folder, when one exists.
    public let experience: String?
    public let limits: [String]
    public let ledgerPerson: [String]
    public let ledgerAgents: [String]
    /// Loose pages this piece grew from, workspace-relative.
    public let captures: [String]

    public func form(_ key: String) -> PieceForm? {
        forms.first { $0.key == key }
    }

    /// Where the whole piece stands: the furthest any of its forms has gone.
    public var stage: Stage {
        if forms.contains(where: { if case .published = $0.state { true } else { false } }) { return .outInTheWorld }
        if forms.contains(where: { $0.state.isSigned }) { return .signed }
        return .draft
    }

    public enum Stage: Int, Comparable, Sendable {
        case draft, signed, outInTheWorld
        public static func < (a: Stage, b: Stage) -> Bool { a.rawValue < b.rawValue }
    }
}

public enum PieceLibraryError: Error, Equatable, LocalizedError {
    case missingForm
    case notSigned
    case unsafeURL
    case alreadyPublished

    public var errorDescription: String? {
        switch self {
        case .missingForm: "That form of the piece is no longer on disk."
        case .notSigned: "Sign this exact version before recording where it was published."
        case .unsafeURL: "Use the public https link to the published post."
        case .alreadyPublished: "This form has already been published. Its signature stays with the record."
        }
    }
}

/// Reads pieces from `drafts/*/piece.json` and records the person's marks:
/// a signature on one exact form, and the public link once they publish it.
/// It never publishes anything itself.
public struct PieceLibrary: Sendable {
    public let workspace: URL
    private let now: @Sendable () -> Date

    public struct Scan: Sendable {
        public let pieces: [Piece]
        public let problems: [String]
    }

    public init(workspace: URL, now: @escaping @Sendable () -> Date = { Date() }) {
        self.workspace = workspace
        self.now = now
    }

    // MARK: Reading

    public func pieces() throws -> Scan {
        let drafts = workspace.appendingPathComponent("drafts", isDirectory: true)
        let names = (try? FileManager.default.contentsOfDirectory(atPath: drafts.path)) ?? []
        var pieces: [Piece] = []
        var problems: [String] = []
        for name in names.sorted() where !name.hasPrefix(".") {
            let manifest = drafts.appendingPathComponent(name).appendingPathComponent("piece.json")
            guard FileManager.default.fileExists(atPath: manifest.path) else { continue }
            do {
                pieces.append(try load(folder: "drafts/\(name)"))
            } catch {
                problems.append("drafts/\(name): the piece manifest could not be read.")
            }
        }
        let ordered = pieces.sorted { ($0.updatedAt ?? "", $0.id) > ($1.updatedAt ?? "", $1.id) }
        return Scan(pieces: ordered, problems: problems)
    }

    public func load(folder: String) throws -> Piece {
        let dir = workspace.appendingPathComponent(folder, isDirectory: true)
        let data = try Data(contentsOf: dir.appendingPathComponent("piece.json"))
        let manifest = try JSONDecoder().decode(Manifest.self, from: data)

        var forms: [PieceForm] = []
        let canonical = manifest.canonical_text ?? "article.md"
        if let path = inside(dir, canonical) {
            forms.append(PieceForm(key: "web", channel: "Essay", path: path, state: state(of: "web", path: path, in: dir)))
        }
        for adaptation in manifest.adaptations ?? [] {
            let key = Self.key(for: adaptation.channel)
            guard key != "web", !forms.contains(where: { $0.key == key }),
                  let path = inside(dir, adaptation.path) else { continue }
            forms.append(PieceForm(key: key, channel: adaptation.channel, path: path, state: state(of: key, path: path, in: dir)))
        }

        let sizes = ["link": (1200, 630), "portrait": (1080, 1350), "square": (1080, 1080)]
        let cards = ["link", "portrait", "square"].compactMap { name -> PieceCard? in
            let path = "cards/\(name).html"
            guard FileManager.default.fileExists(atPath: dir.appendingPathComponent(path).path), let size = sizes[name] else { return nil }
            return PieceCard(name: name, path: path, width: size.0, height: size.1)
        }

        let experience = inside(dir, manifest.experience ?? "index.html")
        return Piece(
            id: manifest.id,
            folder: folder,
            title: Self.plain(manifest.title),
            rawTitle: manifest.title,
            project: manifest.project,
            kicker: manifest.kicker,
            deck: manifest.deck,
            revision: manifest.revision ?? 1,
            updatedAt: manifest.updated_at ?? manifest.created_at,
            authoredBy: manifest.authored_by,
            reviewer: manifest.reviewer,
            forms: forms,
            cards: cards,
            experience: experience,
            limits: manifest.limits ?? [],
            ledgerPerson: manifest.ledger?.person ?? [],
            ledgerAgents: manifest.ledger?.agents ?? [],
            captures: manifest.captures ?? []
        )
    }

    // MARK: The person's marks

    /// Sign one exact form. The record names the bytes it covers; editing
    /// them afterwards unsigns the form.
    public func sign(formKey: String, of piece: Piece) throws -> Piece {
        let dir = workspace.appendingPathComponent(piece.folder, isDirectory: true)
        guard let form = piece.form(formKey) else { throw PieceLibraryError.missingForm }
        if case .published = form.state { throw PieceLibraryError.alreadyPublished }
        let digest = try Self.sha256(of: dir.appendingPathComponent(form.path))
        let record: [String: Any] = [
            "schema": "afi.piece_approval.v1",
            "piece_id": piece.id,
            "form": form.key,
            "path": form.path,
            "revision": piece.revision,
            "payload_sha256": digest,
            "approved_at": ISO8601DateFormatter().string(from: now()),
            "approved_by": "human",
            "surface": "quiet-desk-mac",
        ]
        try write(record, to: dir.appendingPathComponent("approvals/\(form.key).json"))
        return try load(folder: piece.folder)
    }

    public func withdrawSignature(formKey: String, of piece: Piece) throws -> Piece {
        guard let form = piece.form(formKey) else { throw PieceLibraryError.missingForm }
        if case .published = form.state { throw PieceLibraryError.alreadyPublished }
        let file = workspace.appendingPathComponent(piece.folder).appendingPathComponent("approvals/\(form.key).json")
        if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
        return try load(folder: piece.folder)
    }

    /// The person published the signed form themselves; keep the public link
    /// as a receipt for exactly those bytes.
    public func recordPublication(formKey: String, of piece: Piece, url: String) throws -> Piece {
        guard let form = piece.form(formKey) else { throw PieceLibraryError.missingForm }
        guard case .signed(_, let digest) = form.state else { throw PieceLibraryError.notSigned }
        guard let link = URL(string: url.trimmingCharacters(in: .whitespacesAndNewlines)),
              link.scheme == "https", link.host?.isEmpty == false, link.user == nil, link.password == nil
        else { throw PieceLibraryError.unsafeURL }
        let stamp = ISO8601DateFormatter().string(from: now())
        let record: [String: Any] = [
            "schema": "afi.publication_receipt.v0",
            "id": "publication_\(piece.id)_\(form.key)",
            "piece_id": piece.id,
            "form": form.key,
            "proposal_id": "\(piece.id):\(form.key):r\(piece.revision)",
            "approved_payload_sha256": digest,
            "publication_mode": "manual",
            "public_url": link.absoluteString,
            "published_at": stamp,
            "verified_at": NSNull(),
            "verification": ["status": "unverified", "observed_payload_sha256": NSNull(), "notes": NSNull()],
        ]
        try write(record, to: workspace.appendingPathComponent(piece.folder).appendingPathComponent("receipts/\(form.key).json"))
        return try load(folder: piece.folder)
    }

    // MARK: Plumbing

    private func state(of key: String, path: String, in dir: URL) -> FormState {
        guard let digest = try? Self.sha256(of: dir.appendingPathComponent(path)) else { return .draft }
        if let receipt = json(dir.appendingPathComponent("receipts/\(key).json")),
           receipt["approved_payload_sha256"] as? String == digest,
           let url = (receipt["public_url"] as? String).flatMap(URL.init(string:)), url.scheme == "https" {
            let at = (receipt["published_at"] as? String).flatMap { ISO8601DateFormatter().date(from: $0) } ?? .distantPast
            return .published(url: url, at: at)
        }
        guard let approval = json(dir.appendingPathComponent("approvals/\(key).json")),
              approval["approved_by"] as? String == "human" else { return .draft }
        guard approval["payload_sha256"] as? String == digest else { return .changedSinceSigned }
        let at = (approval["approved_at"] as? String).flatMap { ISO8601DateFormatter().date(from: $0) } ?? .distantPast
        return .signed(at: at, sha256: digest)
    }

    /// A manifest path, if it names a file inside the piece folder.
    private func inside(_ dir: URL, _ relative: String) -> String? {
        guard !relative.isEmpty, !relative.hasPrefix("/"), !relative.contains("\\") else { return nil }
        let root = dir.standardizedFileURL.resolvingSymlinksInPath()
        let file = root.appendingPathComponent(relative).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.path + "/"), FileManager.default.fileExists(atPath: file.path) else { return nil }
        return String(file.path.dropFirst(root.path.count + 1))
    }

    private func json(_ file: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: file) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private func write(_ record: [String: Any], to file: URL) throws {
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try JSONSerialization.data(withJSONObject: record, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        try data.write(to: file, options: .atomic)
    }

    static func sha256(of file: URL) throws -> String {
        SHA256.hash(data: try Data(contentsOf: file)).map { String(format: "%02x", $0) }.joined()
    }

    static func key(for channel: String) -> String {
        let lowered = channel.lowercased()
        if ["web", "essay", "site", "website"].contains(lowered) { return "web" }
        return lowered.components(separatedBy: CharacterSet.alphanumerics.inverted).joined()
    }

    static func plain(_ title: String) -> String {
        title.replacingOccurrences(of: "*", with: "").trimmingCharacters(in: .whitespaces)
    }

    private struct Manifest: Decodable {
        struct Adaptation: Decodable {
            let channel: String
            let path: String
        }
        struct Ledger: Decodable {
            let person: [String]?
            let agents: [String]?
        }
        let id: String
        let title: String
        let revision: Int?
        let project: String?
        let kicker: String?
        let deck: String?
        let created_at: String?
        let updated_at: String?
        let authored_by: String?
        let reviewer: String?
        let canonical_text: String?
        let experience: String?
        let adaptations: [Adaptation]?
        let limits: [String]?
        let ledger: Ledger?
        let captures: [String]?
    }
}
