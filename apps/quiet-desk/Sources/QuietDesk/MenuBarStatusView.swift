import AppKit
import QuietDeskCore
import SwiftUI

/// Put something on the desk without opening it: the capture loop's quickest
/// door, one click away in the menu bar.
@MainActor
struct MenuBarStatusView: View {
    let store: QuietDeskStore
    let providerStore: ProviderStore
    @Environment(DeskStore.self) private var desk
    @Environment(\.openWindow) private var openWindow
    @Environment(\.colorScheme) private var scheme
    @State private var text = ""
    @State private var landed = false

    var body: some View {
        let palette = DeskPalette(scheme: scheme)
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                DeskBrandMark().frame(width: 22, height: 22)
                Text("Put it on the desk").font(.deskSerif(17))
                Spacer()
                if landed {
                    Label("On the desk", systemImage: "checkmark")
                        .font(.deskMono(10))
                        .foregroundStyle(palette.ink)
                        .transition(.opacity)
                }
            }
            TextField("What are you working on?", text: $text, axis: .vertical)
                .font(.deskSerif(15))
                .lineLimit(3...8)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("quiet-desk.menubar.capture")
            HStack {
                Text(looseSummary)
                    .font(.deskMono(10.5))
                    .foregroundStyle(palette.muted)
                Spacer()
                Button("Put it down", action: save)
                    .keyboardShortcut(.return, modifiers: .command)
                    .buttonStyle(.borderedProminent)
                    .tint(palette.ink)
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !desk.hasWorkspace)
            }
            if let error = desk.lastError {
                Text(error).font(.caption).foregroundStyle(.orange)
            }
            Divider()
            Button {
                openWindow(id: "main")
                NSApp.activate(ignoringOtherApps: true)
            } label: {
                Label("Open the desk", systemImage: "rectangle.stack")
            }
            .buttonStyle(.borderless)
        }
        .padding(14)
        .frame(width: 320)
        .onAppear {
            if !desk.hasWorkspace { desk.open(workspace: providerStore.workspacePath) } else { desk.refresh() }
        }
        .accessibilityElement(children: .contain)
    }

    private var looseSummary: String {
        let count = desk.captures.filter { $0.status == .loose }.count
        return count == 0 ? "The desk is clear" : "\(count) loose \(count == 1 ? "page" : "pages") on the desk"
    }

    private func save() {
        guard desk.capture(text: text) else { return }
        text = ""
        withAnimation { landed = true }
        Task {
            try? await Task.sleep(for: .seconds(2))
            withAnimation { landed = false }
        }
    }
}
