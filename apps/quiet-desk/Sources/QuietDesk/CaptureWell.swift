import AppKit
import QuietDeskCore
import SwiftUI
import UniformTypeIdentifiers

/// The first step of the loop: put something on the desk the moment it
/// happens. Words, a link, a file or a screenshot; nothing has to be finished.
@MainActor
struct CaptureWell: View {
    @Bindable var desk: DeskStore
    @Binding var focusRequest: Bool
    @Environment(\.colorScheme) private var scheme
    @State private var text = ""
    @State private var attachments: [URL] = []
    @State private var dropTargeted = false
    @FocusState private var focused: Bool

    private var palette: DeskPalette { DeskPalette(scheme: scheme) }
    private var isEmpty: Bool { text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attachments.isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text("What are you working on?")
                        .font(.deskSerif(21))
                        .italic()
                        .foregroundStyle(palette.muted)
                        .padding(.top, 1)
                        .padding(.leading, 5)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
                TextEditor(text: $text)
                    .font(.deskSerif(21))
                    .foregroundStyle(palette.text)
                    .scrollContentBackground(.hidden)
                    .scrollIndicators(.never)
                    .focused($focused)
                    .frame(minHeight: 58, maxHeight: 180)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("What are you working on?")
                    .accessibilityIdentifier("quiet-desk.capture.text")
            }

            if !attachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(attachments, id: \.self) { url in
                            HStack(spacing: 6) {
                                Image(systemName: "doc")
                                Text(url.lastPathComponent).lineLimit(1)
                                Button {
                                    attachments.removeAll { $0 == url }
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                }
                                .buttonStyle(.borderless)
                                .accessibilityLabel("Remove \(url.lastPathComponent)")
                            }
                            .font(.deskMono(11))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(palette.ink.opacity(0.08), in: Capsule())
                        }
                    }
                }
            }

            HStack(spacing: 14) {
                Button {
                    chooseFiles()
                } label: {
                    Label("Add a file", systemImage: "paperclip")
                }
                .buttonStyle(.borderless)
                .foregroundStyle(palette.ink)
                .help("Put a file on the desk. A copy is kept with your note; the original stays where it is.")

                Text(dropTargeted ? "Let go to put it on the desk" : "Words, links, files and screenshots all belong here.")
                    .font(.deskMono(11))
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)

                Spacer(minLength: 12)

                if let error = desk.lastError {
                    Label(error, systemImage: "exclamationmark.circle")
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .lineLimit(2)
                }

                Button {
                    submit()
                } label: {
                    HStack(spacing: 8) {
                        Text("Put it on the desk")
                        Text("⌘↩").font(.deskMono(11)).opacity(0.7)
                    }
                    .padding(.horizontal, 4)
                }
                .buttonStyle(.borderedProminent)
                .tint(palette.ink)
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(isEmpty)
                .accessibilityIdentifier("quiet-desk.capture.submit")
            }
        }
        .padding(.horizontal, 22)
        .padding(.top, 20)
        .padding(.bottom, 16)
        .paper(palette.slip, radius: 6, lifted: focused)
        .overlay {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .strokeBorder(palette.ink.opacity(dropTargeted ? 0.7 : focused ? 0.35 : 0), style: StrokeStyle(lineWidth: 1.5, dash: dropTargeted ? [6, 5] : []))
        }
        .animation(.easeOut(duration: 0.18), value: focused)
        .animation(.easeOut(duration: 0.18), value: dropTargeted)
        .onDrop(of: [.fileURL, .url, .plainText], isTargeted: $dropTargeted) { providers in
            accept(providers)
            return true
        }
        .onChange(of: focusRequest) { _, requested in
            if requested {
                focused = true
                focusRequest = false
            }
        }
    }

    private func submit() {
        guard !isEmpty else { return }
        let words = text
        let files = attachments
        withAnimation(.spring(response: 0.5, dampingFraction: 0.74)) {
            if desk.capture(text: words, attachments: files) {
                text = ""
                attachments = []
            }
        }
    }

    private func chooseFiles() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = true
        panel.prompt = "Add to the note"
        if panel.runModal() == .OK { attachments.append(contentsOf: panel.urls) }
    }

    private func accept(_ providers: [NSItemProvider]) {
        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                _ = provider.loadObject(ofClass: URL.self) { url, _ in
                    guard let url, url.isFileURL else { return }
                    Task { @MainActor in attachments.append(url) }
                }
            } else if provider.canLoadObject(ofClass: URL.self) {
                _ = provider.loadObject(ofClass: URL.self) { url, _ in
                    guard let url else { return }
                    Task { @MainActor in append(url.absoluteString) }
                }
            } else if provider.canLoadObject(ofClass: String.self) {
                _ = provider.loadObject(ofClass: String.self) { words, _ in
                    guard let words else { return }
                    Task { @MainActor in append(words) }
                }
            }
        }
    }

    private func append(_ words: String) {
        text = text.isEmpty ? words : text + "\n" + words
    }
}
