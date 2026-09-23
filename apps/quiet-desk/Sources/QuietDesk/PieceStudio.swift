import AppKit
import QuietDeskCore
import SwiftUI

enum StudioItem: Hashable {
    case form(String)
    case card(String)
}

/// One piece, in its own window: every form it takes, each read the way its
/// audience will see it, and the person's mark on each one separately.
@MainActor
struct PieceStudioView: View {
    @Bindable var desk: DeskStore
    @Bindable var providerStore: ProviderStore
    let folder: String
    @State private var selection: StudioItem? = SnapshotHarness.form.map { .form($0) } ?? .form("web")
    @State private var showReview = true
    @State private var openingError: String?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Group {
            if let piece = desk.piece(folder: folder), let workspace = desk.workspaceURL {
                studio(piece, workspace: workspace)
            } else {
                ContentUnavailableView(
                    "This piece is no longer on the desk",
                    systemImage: "doc.questionmark",
                    description: Text("Its folder may have moved. The Desk shows every piece it can still read.")
                )
            }
        }
        .frame(minWidth: 980, minHeight: 640)
        .onAppear { desk.refresh() }
        .onReceive(NotificationCenter.default.publisher(for: SnapshotHarness.selectStudioItem)) { note in
            guard let key = note.object as? String else { return }
            selection = key.hasPrefix("card:") ? .card(String(key.dropFirst(5))) : .form(key)
        }
    }

    private func studio(_ piece: Piece, workspace: URL) -> some View {
        let dir = workspace.appendingPathComponent(piece.folder, isDirectory: true)
        return NavigationSplitView {
            List(selection: $selection) {
                Section("The piece") {
                    ForEach(piece.forms) { form in
                        FormRow(form: form).tag(StudioItem.form(form.key))
                    }
                }
                if !piece.cards.isEmpty {
                    Section("Images") {
                        ForEach(piece.cards) { card in
                            Label {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(card.name.capitalized + " card")
                                    Text("\(card.width) × \(card.height)").font(.deskMono(10)).foregroundStyle(.secondary)
                                }
                            } icon: {
                                Image(systemName: card.name == "portrait" ? "rectangle.portrait" : card.name == "square" ? "square" : "rectangle")
                            }
                            .tag(StudioItem.card(card.name))
                        }
                    }
                }
            }
            .listStyle(.sidebar)
            .tint(DeskPalette(scheme: scheme).ink)
            .navigationSplitViewColumnWidth(min: 200, ideal: 220, max: 260)
        } detail: {
            StudioPreview(piece: piece, directory: dir, selection: selection ?? .form("web"), providerStore: providerStore, desk: desk)
                .background(DeskPalette(scheme: scheme).canvas)
        }
        .inspector(isPresented: $showReview) {
            ReviewRail(desk: desk, providerStore: providerStore, piece: piece, directory: dir, selection: selection ?? .form("web"), talk: talk)
                .inspectorColumnWidth(min: 300, ideal: 340, max: 420)
        }
        .navigationTitle(piece.title)
        .navigationSubtitle("r\(piece.revision) · \(stageLabel(piece))")
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                if let experience = piece.experience {
                    Button {
                        NSWorkspace.shared.open(dir.appendingPathComponent(experience))
                    } label: {
                        Label("Open in browser", systemImage: "safari")
                    }
                    .help("Open the reader page in your browser")
                }
                Button {
                    MacHelpers.reveal(path: dir.appendingPathComponent("piece.json").path)
                } label: {
                    Label("Reveal in Finder", systemImage: "folder")
                }
                .help("Show the piece's folder in Finder")
                Button(action: talk) {
                    Label("Talk about it", systemImage: "bubble.left.and.text.bubble.right")
                }
                .help("Continue in Codex about this piece")
                Button {
                    showReview.toggle()
                } label: {
                    Label("Review", systemImage: "sidebar.trailing")
                }
                .help("Show or hide your mark and the piece's provenance")
            }
        }
        .alert("Codex could not be opened", isPresented: Binding(get: { openingError != nil }, set: { if !$0 { openingError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(openingError ?? "")
        }
    }

    private func stageLabel(_ piece: Piece) -> String {
        switch piece.stage {
        case .draft: "Draft, awaiting your mark"
        case .signed: "Signed, not yet published"
        case .outInTheWorld: "Out in the world"
        }
    }

    private func talk() {
        Task {
            if let url = await providerStore.prepareCodexConversation(), !NSWorkspace.shared.open(url) {
                openingError = "Open the Codex desktop app and try again."
            }
        }
    }
}

private struct FormRow: View {
    let form: PieceForm

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(form.channel)
                Text(form.state.label)
                    .font(.deskMono(10))
                    .foregroundStyle(.secondary)
            }
        } icon: {
            Image(systemName: icon)
        }
        .badge(Text(" ")) // keeps rows aligned when the dot sits beside them
        .overlay(alignment: .trailing) { FormDot(state: form.state) }
        .accessibilityElement(children: .combine)
        .accessibilityValue(form.state.label)
    }

    private var icon: String {
        switch form.key {
        case "web": "doc.richtext"
        case "substack": "envelope.open"
        case "x": "text.bubble"
        default: "text.alignleft"
        }
    }
}

// MARK: Preview

@MainActor
private struct StudioPreview: View {
    let piece: Piece
    let directory: URL
    let selection: StudioItem
    @Bindable var providerStore: ProviderStore
    @Bindable var desk: DeskStore
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        switch selection {
        case .form("web"):
            essay
        case .form(let key):
            if let form = piece.form(key) {
                AdaptationPreview(form: form, text: text(of: form), reviewer: piece.reviewer)
            } else {
                ContentUnavailableView("This form is not on disk", systemImage: "doc")
            }
        case .card(let name):
            if let card = piece.cards.first(where: { $0.name == name }) {
                CardPreview(card: card, directory: directory)
            }
        }
    }

    @ViewBuilder
    private var essay: some View {
        if let experience = piece.experience {
            if SnapshotHarness.isActive {
                // A background window's web view does not paint; picture it instead.
                PagePicture(page: directory.appendingPathComponent(experience), directory: directory, size: CGSize(width: 1040, height: 2200))
            } else {
                LocalPage(url: directory.appendingPathComponent(experience), readAccess: directory)
            }
        } else {
            VStack(spacing: 18) {
                Spacer()
                Chop(size: 44).opacity(0.25)
                Text("Not set in the house style yet")
                    .font(.deskSerif(26))
                Text("Set it once to read the piece as it will be published, with its sources, colophon and cards.")
                    .font(.deskSerif(15))
                    .italic()
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 420)
                Button {
                    Task {
                        await providerStore.renderPiece(folder: piece.folder)
                        desk.refresh()
                    }
                } label: {
                    Label("Set it in the house style", systemImage: "text.book.closed")
                }
                .buttonStyle(.borderedProminent)
                .tint(DeskPalette(scheme: scheme).ink)
                .disabled(providerStore.isBusy)
                if let error = providerStore.lastError {
                    Text(error).font(.caption).foregroundStyle(.orange).textSelection(.enabled)
                }
                Spacer()
            }
            .padding(40)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func text(of form: PieceForm) -> String {
        (try? String(contentsOf: directory.appendingPathComponent(form.path), encoding: .utf8)) ?? ""
    }
}

/// A channel draft, shaped the way its readers will meet it. No platform
/// chrome or logos: just the width, the fold and the limits that matter.
private struct AdaptationPreview: View {
    let form: PieceForm
    let text: String
    let reviewer: String?
    @Environment(\.colorScheme) private var scheme

    private var palette: DeskPalette { DeskPalette(scheme: scheme) }
    private var body_: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                switch form.key {
                case "linkedin": post(width: 552, fold: 210, limit: 3000, foldLabel: "the feed shows this much before “…more”")
                case "x": post(width: 598, fold: nil, limit: 280, foldLabel: nil)
                default: longform
                }
            }
            .padding(.vertical, 44)
            .padding(.horizontal, 32)
            .frame(maxWidth: .infinity)
        }
    }

    private func post(width: CGFloat, fold: Int?, limit: Int, foldLabel: String?) -> some View {
        let count = body_.count
        let (before, after) = split(body_, at: fold)
        return VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 11) {
                Circle()
                    .fill(palette.ink.opacity(0.14))
                    .overlay(Text(String((reviewer ?? "You").prefix(1))).font(.deskSerif(19)).foregroundStyle(palette.ink))
                    .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(reviewer ?? "You").font(.system(size: 14, weight: .semibold))
                    Text("Not yet posted · a draft on your desk").font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
            }
            Text(before)
                .font(.system(size: 15))
                .lineSpacing(3)
                .textSelection(.enabled)
            if let after, let foldLabel {
                HStack(spacing: 8) {
                    Rectangle().fill(palette.madder.opacity(0.6)).frame(height: 1)
                    Text(foldLabel).font(.deskMono(10)).foregroundStyle(palette.madder).fixedSize()
                    Rectangle().fill(palette.madder.opacity(0.6)).frame(height: 1)
                }
                Text(after)
                    .font(.system(size: 15))
                    .lineSpacing(3)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
            Divider()
            HStack {
                Text("\(count) / \(limit) characters")
                    .font(.deskMono(11))
                    .foregroundStyle(count > limit ? palette.madder : Color.secondary)
                Spacer()
                if count > limit {
                    Label("Too long for one post", systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(palette.madder)
                }
            }
        }
        .padding(20)
        .frame(width: width, alignment: .leading)
        .paper(scheme == .dark ? Color(white: 0.13) : .white, radius: 10)
    }

    private var longform: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(body_.components(separatedBy: "\n\n").enumerated()), id: \.offset) { _, block in
                paragraph(block.trimmingCharacters(in: .whitespacesAndNewlines))
            }
        }
        .padding(.horizontal, 54)
        .padding(.vertical, 48)
        .frame(width: 680, alignment: .leading)
        .paper(palette.sheet, radius: 3)
        .foregroundStyle(palette.sheetInk)
    }

    @ViewBuilder
    private func paragraph(_ block: String) -> some View {
        if block.hasPrefix("# ") {
            Text(block.dropFirst(2)).font(.deskSerif(38)).padding(.bottom, 4)
        } else if block.hasPrefix("## ") {
            Text(block.dropFirst(3)).font(.deskSerif(24)).padding(.top, 12)
        } else if block.hasPrefix("![") {
            Label("An image goes here", systemImage: "photo")
                .font(.deskMono(11))
                .foregroundStyle(.secondary)
                .padding(.vertical, 26)
                .frame(maxWidth: .infinity)
                .background(Color.black.opacity(0.04))
        } else if !block.isEmpty {
            Text((try? AttributedString(markdown: block)) ?? AttributedString(block))
                .font(.deskSerif(17))
                .lineSpacing(5)
                .textSelection(.enabled)
        }
    }

    /// The text before and after a feed's fold, cut at a word boundary.
    private func split(_ text: String, at fold: Int?) -> (String, String?) {
        guard let fold, text.count > fold else { return (text, nil) }
        let cut = text.index(text.startIndex, offsetBy: fold)
        let head = text[..<cut]
        let boundary = head.lastIndex(where: { $0 == " " || $0 == "\n" }) ?? cut
        return (String(text[..<boundary]), String(text[boundary...]).trimmingCharacters(in: .whitespacesAndNewlines))
    }
}

@MainActor
private struct CardPreview: View {
    let card: PieceCard
    let directory: URL
    @State private var exported: URL?
    @State private var exporting = false
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(spacing: 18) {
            GeometryReader { geometry in
                let zoom = min((geometry.size.width - 64) / CGFloat(card.width), (geometry.size.height - 64) / CGFloat(card.height), 1)
                Group {
                    if SnapshotHarness.isActive {
                        PagePicture(page: directory.appendingPathComponent(card.path), directory: directory, size: CGSize(width: card.width, height: card.height))
                    } else {
                        LocalPage(url: directory.appendingPathComponent(card.path), readAccess: directory, zoom: zoom)
                    }
                }
                    .frame(width: CGFloat(card.width) * zoom, height: CGFloat(card.height) * zoom)
                    .paper(DeskPalette(scheme: scheme).sheet, radius: 2)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            HStack(spacing: 14) {
                Text("\(card.width) × \(card.height) · exported at twice the size for sharp uploads")
                    .font(.deskMono(11))
                    .foregroundStyle(.secondary)
                Spacer()
                if let exported {
                    Button("Show the PNG") { NSWorkspace.shared.activateFileViewerSelecting([exported]) }
                        .buttonStyle(.borderless)
                }
                Button {
                    Task { await export() }
                } label: {
                    Label(exporting ? "Exporting…" : "Export PNG", systemImage: "square.and.arrow.down")
                }
                .disabled(exporting)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 18)
        }
    }

    private func export() async {
        exporting = true
        defer { exporting = false }
        let size = CGSize(width: card.width, height: card.height)
        guard let image = await PageSnapshotter.shared.image(of: directory.appendingPathComponent(card.path), readAccess: directory, size: size, snapshotWidth: CGFloat(card.width)),
              let tiff = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff),
              let png = bitmap.representation(using: .png, properties: [:])
        else { return }
        let file = directory.appendingPathComponent("cards/\(card.name)@2x.png")
        if (try? png.write(to: file, options: .atomic)) != nil { exported = file }
    }
}

// MARK: Review

@MainActor
private struct ReviewRail: View {
    @Bindable var desk: DeskStore
    @Bindable var providerStore: ProviderStore
    let piece: Piece
    let directory: URL
    let selection: StudioItem
    let talk: () -> Void
    @State private var confirmSigning = false
    @State private var link = ""
    @State private var request = ""
    @State private var requestSaved = false
    @Environment(\.colorScheme) private var scheme

    private var palette: DeskPalette { DeskPalette(scheme: scheme) }
    private var form: PieceForm? {
        if case .form(let key) = selection { return piece.form(key) }
        return nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                if let form {
                    mark(form)
                    if case .signed = form.state { publish(form) }
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        LedgerLabel("Images")
                        Text("Cards are set from the essay’s words. Sign the essay and each post they travel with; export the card when you publish.")
                            .font(.deskSerif(14))
                            .foregroundStyle(palette.muted)
                    }
                }
                change
                provenance
            }
            .padding(22)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(palette.paper)
        .onChange(of: selection) { _, _ in
            link = ""
            desk.clearError()
        }
    }

    // Your mark

    @ViewBuilder
    private func mark(_ form: PieceForm) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            LedgerLabel("Your mark · \(form.channel)", color: palette.madder)
            switch form.state {
            case .draft:
                Text("Awaiting your mark")
                    .font(.deskSerif(24))
                Text("Signing covers these exact words, for this one place. If they change, the signature comes off.")
                    .font(.deskSerif(14))
                    .foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                signButton("Sign \(formName(form)) as it reads now", form: form)
            case .changedSinceSigned:
                Text("Changed since you signed")
                    .font(.deskSerif(24))
                    .foregroundStyle(palette.madder)
                Text("The words were edited after your signature. Read them again, then sign this version.")
                    .font(.deskSerif(14))
                    .foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                signButton("Sign this version", form: form)
            case .signed(let at, let digest):
                HStack(alignment: .center, spacing: 16) {
                    Chop(size: 56)
                        .transition(.asymmetric(insertion: .scale(scale: 1.9).combined(with: .opacity), removal: .opacity))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Signed by you").font(.deskSerif(22))
                        Text(at, format: .dateTime.weekday(.wide).month().day().hour().minute())
                            .font(.deskMono(11))
                            .foregroundStyle(palette.muted)
                    }
                }
                Text("Covers these exact words · sha256 \(digest.prefix(10))…")
                    .font(.deskMono(10.5))
                    .foregroundStyle(palette.muted)
                    .textSelection(.enabled)
                Button("Withdraw the signature") {
                    withAnimation(.easeOut(duration: 0.2)) { desk.withdrawSignature(form.key, of: piece) }
                }
                .buttonStyle(.link)
                .font(.caption)
            case .published(let url, let at):
                HStack(spacing: 14) {
                    Chop(size: 44)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Out in the world").font(.deskSerif(22))
                        Text(at, format: .dateTime.month().day().year())
                            .font(.deskMono(11))
                            .foregroundStyle(palette.muted)
                    }
                }
                Link(destination: url) {
                    Label(url.host(percentEncoded: false) ?? url.absoluteString, systemImage: "arrow.up.right")
                }
                Text("Receipt kept beside the piece, for these exact words.")
                    .font(.deskMono(10.5))
                    .foregroundStyle(palette.muted)
            }
            if let error = desk.lastError {
                Label(error, systemImage: "exclamationmark.circle").font(.caption).foregroundStyle(.orange)
            }
        }
        .animation(.spring(response: 0.42, dampingFraction: 0.62), value: form.state)
    }

    private func signButton(_ title: String, form: PieceForm) -> some View {
        Button {
            confirmSigning = true
        } label: {
            Label(title, systemImage: "signature")
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
        }
        .buttonStyle(.borderedProminent)
        .tint(palette.madder)
        .controlSize(.large)
        .confirmationDialog("Sign \(formName(form)) exactly as it reads now?", isPresented: $confirmSigning) {
            Button("Sign") {
                withAnimation(.spring(response: 0.42, dampingFraction: 0.62)) { desk.sign(form.key, of: piece) }
            }
            Button("Not yet", role: .cancel) {}
        } message: {
            Text("Your signature covers only this form, and only these words. Nothing is published: you post it yourself, then keep the link here.")
        }
        .accessibilityIdentifier("quiet-desk.studio.sign")
    }

    private func formName(_ form: PieceForm) -> String {
        switch form.key {
        case "web": "the essay"
        case "substack": "the Substack draft"
        default: "the \(form.channel) post"
        }
    }

    // Publishing, by the person

    private func publish(_ form: PieceForm) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            LedgerLabel("Publish it yourself")
            Text("Quiet Desk never posts for you. When it is out, keep the link here as a receipt for these words.")
                .font(.deskSerif(14))
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                let text = (try? String(contentsOf: directory.appendingPathComponent(form.path), encoding: .utf8)) ?? ""
                MacHelpers.copy(text.trimmingCharacters(in: .whitespacesAndNewlines))
            } label: {
                Label("Copy the words", systemImage: "doc.on.doc")
            }
            HStack(spacing: 8) {
                TextField("https://… where it was published", text: $link)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit(save)
                Button("Keep", action: save)
                    .disabled(link.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private func save() {
        guard let form else { return }
        if desk.recordPublication(form.key, of: piece, url: link) { link = "" }
    }

    // Asking for a change

    private var change: some View {
        VStack(alignment: .leading, spacing: 10) {
            LedgerLabel("Ask for a change")
            ZStack(alignment: .topLeading) {
                if request.isEmpty {
                    Text("What should change? In your words.")
                        .font(.deskSerif(14))
                        .italic()
                        .foregroundStyle(palette.muted)
                        .padding(.top, 8)
                        .padding(.leading, 5)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $request)
                    .font(.deskSerif(14))
                    .scrollContentBackground(.hidden)
                    .frame(height: 76)
                    .padding(4)
            }
            .background(palette.slip, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(palette.rule))
            HStack {
                Button("Leave the note") {
                    desk.requestChange(request, for: piece)
                    if desk.lastError == nil {
                        request = ""
                        requestSaved = true
                    }
                }
                .disabled(request.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button("Talk it through", action: talk)
                    .buttonStyle(.borderless)
                    .foregroundStyle(palette.ink)
            }
            if requestSaved {
                Text("Kept beside the piece in review/requests.md. Codex reads it the next time you talk.")
                    .font(.deskMono(10.5))
                    .foregroundStyle(palette.muted)
            }
        }
    }

    // Who did what

    private var provenance: some View {
        VStack(alignment: .leading, spacing: 14) {
            LedgerLabel("Who did what")
            HStack(alignment: .top, spacing: 16) {
                ledger("The person", piece.ledgerPerson.isEmpty ? ["the point of view", "the final say on every word"] : piece.ledgerPerson)
                ledger("The agents", piece.ledgerAgents.isEmpty ? [piece.authoredBy.map { "drafted by \($0)" } ?? "drafted the piece"] : piece.ledgerAgents)
            }
            if !piece.limits.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    LedgerLabel("Limits it states")
                    ForEach(piece.limits, id: \.self) { limit in
                        Text("— \(limit)").font(.deskMono(11)).foregroundStyle(palette.text).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            if !piece.captures.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    LedgerLabel("Grew from")
                    ForEach(piece.captures, id: \.self) { path in
                        Button {
                            MacHelpers.reveal(path: (desk.workspaceURL ?? directory).appendingPathComponent(path).path)
                        } label: {
                            Label(URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent, systemImage: "note.text")
                                .font(.deskMono(11))
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }
            Text("I made this with Agents for Introverts. The point of view is mine, and the agents helped it travel.")
                .font(.deskSerif(13))
                .italic()
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func ledger(_ title: String, _ lines: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(.deskMono(9.5, weight: .medium))
                .tracking(1.2)
                .foregroundStyle(palette.ink)
            ForEach(lines, id: \.self) { line in
                Text("— \(line)")
                    .font(.deskMono(11))
                    .foregroundStyle(palette.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
