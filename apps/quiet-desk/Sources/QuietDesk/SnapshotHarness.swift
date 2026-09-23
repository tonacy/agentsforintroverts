import AppKit
import QuietDeskCore
import SwiftUI
#if DEBUG
import ScreenCaptureKit
#endif

/// Design review, not a feature. In a debug build with
/// `QUIET_DESK_SNAPSHOT_DIR` set, the app opens the Desk and the first piece,
/// pictures only its own windows, writes the PNGs there, and quits. Its
/// settings live in their own defaults domain, never the person's.
@MainActor
enum SnapshotHarness {
    #if DEBUG
    private static let environment = ProcessInfo.processInfo.environment
    static var directory: URL? { environment["QUIET_DESK_SNAPSHOT_DIR"].map { URL(fileURLWithPath: $0, isDirectory: true) } }
    #else
    static var directory: URL? { nil }
    #endif

    static var isActive: Bool { directory != nil }
    static let selectStudioItem = Notification.Name("QuietDeskSnapshotSelectStudioItem")
    static var defaults: UserDefaults? { isActive ? UserDefaults(suiteName: "quietdesk.snapshots") : nil }

    #if DEBUG
    static var workspace: String? { isActive ? environment["QUIET_DESK_SNAPSHOT_WORKSPACE"] : nil }
    static var form: String? { isActive ? environment["QUIET_DESK_SNAPSHOT_FORM"] : nil }

    static func run(openWindow: OpenWindowAction, desk: DeskStore) async {
        guard let directory else { return }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if let appearance = environment["QUIET_DESK_SNAPSHOT_APPEARANCE"] {
            NSApp.appearance = NSAppearance(named: appearance == "dark" ? .darkAqua : .aqua)
        }
        let size = size(environment["QUIET_DESK_SNAPSHOT_SIZE"]) ?? CGSize(width: 1440, height: 1000)
        try? await Task.sleep(for: .seconds(1))
        if let main = NSApp.windows.first(where: { $0.isVisible && $0.title == "On the desk" }) ?? NSApp.windows.first(where: \.isVisible) {
            main.setFrame(NSRect(origin: CGPoint(x: 40, y: 40), size: size), display: true)
            try? await Task.sleep(for: .seconds(3.5))
            await capture(main, to: directory.appendingPathComponent("desk.png"))
            if let scroll = largestScrollView(in: main.contentView) {
                let height = scroll.documentView?.frame.height ?? 0
                scroll.contentView.scroll(to: NSPoint(x: 0, y: max(0, height - scroll.contentView.bounds.height)))
                scroll.reflectScrolledClipView(scroll.contentView)
                try? await Task.sleep(for: .seconds(1))
                await capture(main, to: directory.appendingPathComponent("desk-lower.png"))
            }
        }
        let wanted = environment["QUIET_DESK_SNAPSHOT_PIECE"]
        if let piece = desk.pieces.first(where: { $0.folder == wanted }) ?? desk.pieces.first {
            openWindow(id: "piece", value: piece.folder)
            try? await Task.sleep(for: .seconds(2))
            if let studio = NSApp.windows.first(where: { $0.isVisible && $0.title == piece.title }) {
                studio.setFrame(NSRect(origin: CGPoint(x: 60, y: 60), size: CGSize(width: 1360, height: 880)), display: true)
                let items = (environment["QUIET_DESK_SNAPSHOT_ITEMS"] ?? "web").split(separator: ",").map(String.init)
                for item in items {
                    NotificationCenter.default.post(name: selectStudioItem, object: item)
                    try? await Task.sleep(for: .seconds(2.5))
                    await capture(studio, to: directory.appendingPathComponent("studio-\(item.replacingOccurrences(of: ":", with: "-")).png"))
                }
            }
        }
        NSApp.terminate(nil)
    }

    private static func largestScrollView(in view: NSView?) -> NSScrollView? {
        guard let view else { return nil }
        var best: NSScrollView?
        var queue = [view]
        while let next = queue.popLast() {
            if let scroll = next as? NSScrollView, (scroll.documentView?.frame.height ?? 0) > (best?.documentView?.frame.height ?? 0) {
                best = scroll
            }
            queue.append(contentsOf: next.subviews)
        }
        return best
    }

    private static func size(_ value: String?) -> CGSize? {
        guard let parts = value?.split(separator: "x").compactMap({ Double($0) }), parts.count == 2 else { return nil }
        return CGSize(width: parts[0], height: parts[1])
    }

    private static func capture(_ window: NSWindow, to file: URL) async {
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
            guard let target = content.windows.first(where: { $0.windowID == CGWindowID(window.windowNumber) }) else { return }
            let configuration = SCStreamConfiguration()
            configuration.width = Int(target.frame.width * 2)
            configuration.height = Int(target.frame.height * 2)
            configuration.showsCursor = false
            configuration.ignoreShadowsSingleWindow = true
            let image = try await SCScreenshotManager.captureImage(contentFilter: SCContentFilter(desktopIndependentWindow: target), configuration: configuration)
            try NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])?.write(to: file)
        } catch {
            try? "\(error)".write(to: file.appendingPathExtension("error.txt"), atomically: true, encoding: .utf8)
        }
    }
    #else
    static var workspace: String? { nil }
    static var form: String? { nil }
    static func run(openWindow: OpenWindowAction, desk: DeskStore) async {}
    #endif
}

extension View {
    /// Snapshots are taken from a background window; draw its controls the
    /// way the person sees them in a window they are using.
    @ViewBuilder
    func snapshotActiveAppearance() -> some View {
        if SnapshotHarness.isActive {
            environment(\.controlActiveState, .key)
        } else {
            self
        }
    }
}
