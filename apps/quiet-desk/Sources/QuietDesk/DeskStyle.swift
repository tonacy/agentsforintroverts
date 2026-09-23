import AppKit
import QuietDeskCore
import SwiftUI

/// The Desk's materials. Paper for the person's things, forest ink for the
/// work, madder red only for the person's own mark. The serif carries the
/// person's words; the mono carries the agents' notes and ledgers.
extension DeskPalette {
    var text: Color { scheme == .dark ? Color(red: 0.91, green: 0.90, blue: 0.86) : Color(red: 0.09, green: 0.14, blue: 0.11) }
    var muted: Color { scheme == .dark ? Color(red: 0.66, green: 0.70, blue: 0.66) : Color(red: 0.42, green: 0.47, blue: 0.43) }
    var rule: Color { scheme == .dark ? Color.white.opacity(0.10) : Color(red: 0.84, green: 0.80, blue: 0.73) }
    var madder: Color { scheme == .dark ? Color(red: 0.90, green: 0.49, blue: 0.40) : Color(red: 0.65, green: 0.25, blue: 0.18) }
    /// Pieces stay paper in the dark: they are the things you would print.
    var sheet: Color { Color(red: 0.97, green: 0.96, blue: 0.92) }
    var sheetInk: Color { Color(red: 0.09, green: 0.14, blue: 0.11) }
    var note: Color { scheme == .dark ? Color(red: 0.20, green: 0.25, blue: 0.21) : Color(red: 0.91, green: 0.93, blue: 0.87) }
    var slip: Color { scheme == .dark ? Color(red: 0.19, green: 0.23, blue: 0.21) : Color(red: 0.99, green: 0.98, blue: 0.95) }
    var shadow: Color { Color.black.opacity(scheme == .dark ? 0.35 : 0.10) }
}

extension Font {
    static func deskSerif(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }

    static func deskMono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

/// A small caps label in the ledger's voice.
struct LedgerLabel: View {
    let text: String
    var color: Color?
    @Environment(\.colorScheme) private var scheme

    init(_ text: String, color: Color? = nil) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text.uppercased())
            .font(.deskMono(10, weight: .medium))
            .tracking(1.4)
            .foregroundStyle(color ?? DeskPalette(scheme: scheme).muted)
    }
}

/// A sheet of paper lying on the desk.
struct PaperModifier: ViewModifier {
    let color: Color
    var radius: CGFloat = 4
    var lifted = false
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        let palette = DeskPalette(scheme: scheme)
        content
            .background(color, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Color.black.opacity(scheme == .dark ? 0.25 : 0.06), lineWidth: 0.5))
            .shadow(color: palette.shadow.opacity(0.6), radius: 0.5, y: 0.5)
            .shadow(color: palette.shadow, radius: lifted ? 18 : 10, y: lifted ? 10 : 5)
    }
}

extension View {
    func paper(_ color: Color, radius: CGFloat = 4, lifted: Bool = false) -> some View {
        modifier(PaperModifier(color: color, radius: radius, lifted: lifted))
    }
}

/// A title as written in a manifest, with its `*italic*` phrase set in the
/// accent, the way the printed piece sets it.
func emphasizedTitle(_ raw: String, accent: Color) -> Text {
    let parts = raw.components(separatedBy: "*")
    return parts.enumerated().reduce(Text("")) { text, part in
        let (index, words) = part
        return index % 2 == 1 ? text + Text(words).italic().foregroundColor(accent) : text + Text(words)
    }
}

/// The house sprig: three leaves on a stem, drawn in a 28-point square.
struct Sprig: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 28
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * s, y: rect.minY + y * s) }
        var path = Path()
        path.move(to: p(13.6, 24.6))
        path.addCurve(to: p(9.0, 16.5), control1: p(13.2, 21.0), control2: p(11.8, 18.3))
        path.addCurve(to: p(14.6, 20.8), control1: p(11.9, 16.7), control2: p(14.0, 18.3))
        path.closeSubpath()
        path.move(to: p(15.6, 15.3))
        path.addCurve(to: p(22.6, 6.0), control1: p(15.9, 10.7), control2: p(18.4, 7.3))
        path.addCurve(to: p(15.6, 15.3), control1: p(21.3, 10.2), control2: p(18.8, 13.2))
        path.closeSubpath()
        path.move(to: p(14.4, 13.7))
        path.addCurve(to: p(12.0, 4.6), control1: p(11.8, 11.4), control2: p(11.0, 8.3))
        path.addCurve(to: p(14.4, 13.7), control1: p(14.5, 7.2), control2: p(15.2, 10.3))
        path.closeSubpath()
        var stem = Path()
        stem.move(to: p(14.3, 25.2))
        stem.addCurve(to: p(15.9, 13.6), control1: p(14.4, 20.8), control2: p(14.8, 16.9))
        path.addPath(stem.strokedPath(StrokeStyle(lineWidth: 1.2 * s, lineCap: .round)))
        return path
    }
}

/// The person's mark: a small red chop with the sprig in it.
struct Chop: View {
    var size: CGFloat = 34
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let madder = DeskPalette(scheme: scheme).madder
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.1, style: .continuous)
                .fill(madder.opacity(0.08))
            RoundedRectangle(cornerRadius: size * 0.1, style: .continuous)
                .strokeBorder(madder, lineWidth: max(1.5, size * 0.055))
            Sprig()
                .fill(madder)
                .frame(width: size * 0.7, height: size * 0.7)
        }
        .frame(width: size, height: size)
        .rotationEffect(.degrees(-7))
        .accessibilityHidden(true)
    }
}

/// Stable, gentle tilt for a piece of paper, from its identity.
func paperTilt(_ key: String, range: Double = 2.4) -> Double {
    var hash: UInt64 = 1469598103934665603
    for byte in key.utf8 {
        hash ^= UInt64(byte)
        hash = hash &* 1099511628211
    }
    return (Double(hash % 1000) / 1000 - 0.5) * 2 * range
}
