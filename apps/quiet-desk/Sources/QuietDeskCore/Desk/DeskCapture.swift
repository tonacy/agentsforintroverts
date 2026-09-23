import Foundation

/// A loose page: something the person put on the Desk in the moment, before
/// any conversation. The words are theirs and are kept exactly as written;
/// the file says so in its frontmatter so no agent mistakes it for its own.
public struct DeskCapture: Identifiable, Hashable, Sendable {
    public enum Kind: String, Sendable {
        case note = "quick_note"
        case link
        case file
        case image
    }

    public enum Status: String, Sendable {
        case loose
        case setAside = "set_aside"
    }

    public var id: String { path }
    /// Workspace-relative, e.g. `captures/2026-09-23/094105-a-thought.md`.
    public let path: String
    public let createdAt: Date
    public let kind: Kind
    public let status: Status
    public let text: String
    public let url: URL?
    /// Workspace-relative path of a copied file, when one was dropped.
    public let attachment: String?
    /// Same-second captures are numbered; the later one sorts first.
    let sequence: Int

    /// Work that already points at this page has gathered it.
    public func isGathered(by references: Set<String>) -> Bool {
        references.contains(path)
    }
}

public enum DeskCaptureError: Error, Equatable, LocalizedError {
    case empty
    case attachmentTooLarge(String)
    case unreadable(String)

    public var errorDescription: String? {
        switch self {
        case .empty: "There is nothing to put on the desk yet."
        case .attachmentTooLarge(let name): "\(name) is larger than 50 MB. Keep it where it is and put a note about it on the desk."
        case .unreadable(let name): "\(name) could not be read."
        }
    }
}

/// Writes and reads loose pages under `captures/<date>/`. It only ever
/// creates new files, and the one change it makes to an existing page is the
/// person's own decision to set it aside.
public struct DeskCaptureStore: Sendable {
    public let workspace: URL
    private let now: @Sendable () -> Date
    private let timeZone: TimeZone
    private static let attachmentLimit = 50 * 1024 * 1024
    private static let imageTypes: Set<String> = ["png", "jpg", "jpeg", "heic", "gif", "webp", "tiff"]

    public init(workspace: URL, now: @escaping @Sendable () -> Date = { Date() }, timeZone: TimeZone = .current) {
        self.workspace = workspace
        self.now = now
        self.timeZone = timeZone
    }

    // MARK: Writing

    /// One page per dropped file, with the words on the first; words alone
    /// make one page. A lone https link becomes a link page.
    @discardableResult
    public func capture(text: String, attachments: [URL] = []) throws -> [DeskCapture] {
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty || !attachments.isEmpty else { throw DeskCaptureError.empty }
        let moment = now()
        let (day, time) = stamp(moment)
        let folder = workspace.appendingPathComponent("captures/\(day)", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

        if attachments.isEmpty {
            let link = Self.loneLink(words)
            let kind: DeskCapture.Kind = link == nil ? .note : .link
            let slug = link.map { Self.slug($0.host ?? "link") } ?? Self.slug(words)
            return [try write(words: words, kind: kind, url: link, attachment: nil, moment: moment, day: day, time: time, slug: slug)]
        }

        var written: [DeskCapture] = []
        for (index, file) in attachments.enumerated() {
            let copied = try copy(file, day: day, time: time)
            let ext = file.pathExtension.lowercased()
            let kind: DeskCapture.Kind = Self.imageTypes.contains(ext) ? .image : .file
            let slug = Self.slug(index == 0 && !words.isEmpty ? words : file.deletingPathExtension().lastPathComponent)
            written.append(try write(words: index == 0 ? words : "", kind: kind, url: nil, attachment: copied, moment: moment, day: day, time: time, slug: slug))
        }
        return written
    }

    /// The person decided this page is not for the desk. Its words stay.
    public func setAside(_ capture: DeskCapture) throws {
        let file = workspace.appendingPathComponent(capture.path)
        let text = try String(contentsOf: file, encoding: .utf8)
        guard let range = text.range(of: "\nstatus: loose\n") else { return }
        try text.replacingCharacters(in: range, with: "\nstatus: set_aside\n").write(to: file, atomically: true, encoding: .utf8)
    }

    // MARK: Reading

    public func list() throws -> [DeskCapture] {
        let root = workspace.appendingPathComponent("captures", isDirectory: true)
        guard let days = try? FileManager.default.contentsOfDirectory(atPath: root.path) else { return [] }
        var captures: [DeskCapture] = []
        for day in days where day.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil {
            let folder = root.appendingPathComponent(day, isDirectory: true)
            let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
            for name in names where name.hasSuffix(".md") {
                if let capture = read(path: "captures/\(day)/\(name)") { captures.append(capture) }
            }
        }
        return captures.sorted {
            if $0.createdAt != $1.createdAt { return $0.createdAt > $1.createdAt }
            if $0.sequence != $1.sequence { return $0.sequence > $1.sequence }
            return $0.path > $1.path
        }
    }

    // MARK: Plumbing

    private func stamp(_ date: Date) -> (day: String, time: String) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let c = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        let day = String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
        let time = String(format: "%02d%02d%02d", c.hour ?? 0, c.minute ?? 0, c.second ?? 0)
        return (day, time)
    }

    private func write(words: String, kind: DeskCapture.Kind, url: URL?, attachment: String?, moment: Date, day: String, time: String, slug: String) throws -> DeskCapture {
        let created = ISO8601DateFormatter().string(from: moment)
        for sequence in 1...99 {
            let suffix = sequence == 1 ? "" : "-\(sequence)"
            let path = "captures/\(day)/\(time)-\(slug)\(suffix).md"
            var lines = [
                "---",
                "id: capture_\(day.replacingOccurrences(of: "-", with: ""))_\(time)_\(slug.replacingOccurrences(of: "-", with: "_"))\(sequence == 1 ? "" : "_\(sequence)")",
                "created_at: \(created)",
                "author: human",
                "source_kind: \(kind.rawValue)",
                "status: loose",
            ]
            if let url { lines.append("url: \(Self.quote(url.absoluteString))") }
            if let attachment { lines.append("attachment: \(Self.quote(attachment))") }
            lines.append("---")
            let body = words.isEmpty ? "" : "\n\(words)\n"
            let data = Data((lines.joined(separator: "\n") + "\n" + body).utf8)
            do {
                try data.write(to: workspace.appendingPathComponent(path), options: .withoutOverwriting)
            } catch CocoaError.fileWriteFileExists {
                continue
            }
            return DeskCapture(path: path, createdAt: moment, kind: kind, status: .loose, text: words, url: url, attachment: attachment, sequence: sequence)
        }
        throw DeskCaptureError.unreadable(slug)
    }

    private func copy(_ file: URL, day: String, time: String) throws -> String {
        let name = file.lastPathComponent
        let size = (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        guard size <= Self.attachmentLimit else { throw DeskCaptureError.attachmentTooLarge(name) }
        let folder = workspace.appendingPathComponent("captures/\(day)/files", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let safe = name.replacingOccurrences(of: "/", with: "-")
        for sequence in 1...99 {
            let target = sequence == 1 ? "\(time)-\(safe)" : "\(time)-\(sequence)-\(safe)"
            let destination = folder.appendingPathComponent(target)
            if FileManager.default.fileExists(atPath: destination.path) { continue }
            do {
                try FileManager.default.copyItem(at: file, to: destination)
            } catch {
                throw DeskCaptureError.unreadable(name)
            }
            return "captures/\(day)/files/\(target)"
        }
        throw DeskCaptureError.unreadable(name)
    }

    private func read(path: String) -> DeskCapture? {
        guard let text = try? String(contentsOf: workspace.appendingPathComponent(path), encoding: .utf8),
              text.hasPrefix("---\n"),
              let end = text.range(of: "\n---\n", range: text.index(text.startIndex, offsetBy: 3)..<text.endIndex)
        else { return nil }
        var fields: [String: String] = [:]
        for line in text[text.index(text.startIndex, offsetBy: 4)..<end.lowerBound].split(separator: "\n") {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let key = line[..<colon].trimmingCharacters(in: .whitespaces)
            fields[key] = Self.unquote(line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces))
        }
        // Only the person's own pages belong on the desk as loose pages.
        guard fields["author"] == "human",
              let created = fields["created_at"].flatMap({ ISO8601DateFormatter().date(from: $0) })
        else { return nil }
        let body = text[end.upperBound...].trimmingCharacters(in: .whitespacesAndNewlines)
        let sequence = path.range(of: #"-(\d+)\.md$"#, options: .regularExpression)
            .flatMap { Int(path[$0].dropFirst().dropLast(3)) } ?? 1
        return DeskCapture(
            path: path,
            createdAt: created,
            kind: DeskCapture.Kind(rawValue: fields["source_kind"] ?? "") ?? .note,
            status: DeskCapture.Status(rawValue: fields["status"] ?? "") ?? .loose,
            text: body,
            url: fields["url"].flatMap(URL.init(string:)),
            attachment: fields["attachment"],
            sequence: sequence
        )
    }

    static func loneLink(_ words: String) -> URL? {
        guard !words.contains(where: \.isWhitespace),
              let url = URL(string: words), url.scheme == "https", url.host != nil,
              url.user == nil, url.password == nil
        else { return nil }
        return url
    }

    static func slug(_ text: String) -> String {
        let words = text.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .prefix(5)
        let joined = words.joined(separator: "-")
        let clipped = String(joined.prefix(40)).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return clipped.isEmpty ? "note" : clipped
    }

    private static func quote(_ value: String) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .withoutEscapingSlashes
        let data = (try? encoder.encode(value)) ?? Data("\"\"".utf8)
        return String(decoding: data, as: UTF8.self)
    }

    private static func unquote(_ value: String) -> String {
        guard value.hasPrefix("\""), let data = value.data(using: .utf8),
              let decoded = try? JSONDecoder().decode(String.self, from: data) else { return value }
        return decoded
    }
}
