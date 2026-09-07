import QuietDeskCore
import SwiftUI

/// The providers this Mac already has. Quiet Desk detects them, marks the one
/// in use, and hands the daily conversation to it. No key is ever entered here.
@MainActor
struct ProvidersView: View {
    @Bindable var providerStore: ProviderStore
    @Bindable var router: AppRouter

    var body: some View {
        Group {
            if let catalog = providerStore.catalog {
                List {
                    Section {
                        ForEach(catalog.providers) { provider in
                            Button {
                                router.show(.provider(provider.id))
                            } label: {
                                ProviderRow(provider: provider, isPreferred: catalog.preferred == provider.id)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("quiet-desk.providers.\(provider.id)")
                        }
                    } footer: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Quiet Desk stores no credentials. It uses the sign-in your terminal already has.")
                            Text("Checked \(catalog.checkedAt.formatted(date: .omitted, time: .shortened)).")
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.top, 6)
                    }
                }
                .listStyle(.inset)
            } else if providerStore.isBusy {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Checking which providers this Mac already has…")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView {
                    Label("Providers not checked", systemImage: "terminal")
                } description: {
                    Text(providerStore.lastError ?? "Quiet Desk looks for Claude Code, Codex CLI, and an Anthropic profile that are already signed in on this Mac.")
                } actions: {
                    Button("Check now") {
                        Task { await providerStore.refreshProviders() }
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
        .task {
            if providerStore.catalog == nil && !providerStore.isBusy {
                await providerStore.refreshProviders()
            }
        }
    }
}

private struct ProviderRow: View {
    let provider: ProviderDescriptor
    let isPreferred: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: isPreferred ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(isPreferred ? Color.accentColor : Color.secondary)
                .frame(width: 18)
                .accessibilityHidden(true)

            Image(systemName: provider.systemImage)
                .font(.title3)
                .foregroundStyle(.secondary)
                .frame(width: 28)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(provider.label)
                        .font(.headline)
                    if isPreferred {
                        Text("In use")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color.accentColor)
                    }
                }
                Text(provider.version.map { "Version \($0)" } ?? provider.kind.rowLabel)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            AvailabilityPill(availability: provider.availability)
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(provider.label), \(provider.availability.label)\(isPreferred ? ", in use" : "")")
        .accessibilityHint("Show how to sign in and choose this provider for the daily conversation")
    }
}

private extension ProviderKind {
    var rowLabel: String {
        switch self {
        case .harness: "Terminal harness"
        case .sdk: "Account"
        case .fixture: "Offline"
        }
    }
}

struct AvailabilityPill: View {
    let availability: ProviderAvailability

    var body: some View {
        Text(availability.label)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(tint.opacity(0.14), in: Capsule())
            .foregroundStyle(tint)
    }

    private var tint: Color {
        switch availability {
        case .signedIn: .green
        case .notSignedIn: .orange
        case .notInstalled, .unknown: .secondary
        }
    }
}

/// The inspector for one provider: what it is, how to sign in, and the one
/// button that chooses it.
@MainActor
struct ProviderDetailView: View {
    @Bindable var providerStore: ProviderStore
    let providerID: String

    @State private var selectedModelKey = ""
    @State private var copied = false

    private var provider: ProviderDescriptor? {
        providerStore.catalog?.provider(id: providerID)
    }

    private var isPreferred: Bool {
        providerStore.catalog?.preferred == providerID
    }

    var body: some View {
        Group {
            if let provider {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        header(provider)
                        Text(provider.summary)
                            .font(.callout)
                            .fixedSize(horizontal: false, vertical: true)

                        if let hint = provider.signInHint, provider.availability != .signedIn {
                            signIn(hint)
                        }

                        if provider.models.count > 1 {
                            modelPicker(provider)
                        }

                        chooseButton(provider)

                        if let path = provider.path {
                            LabeledContent("Found at", value: path)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Text("Quiet Desk stores no credentials. It uses the sign-in your terminal already has.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onAppear {
                    if isPreferred { selectedModelKey = providerStore.preferredModel ?? "" }
                }
            } else {
                ContentUnavailableView("Select a provider", systemImage: "terminal")
            }
        }
        .navigationTitle("Provider")
    }

    private func header(_ provider: ProviderDescriptor) -> some View {
        HStack(spacing: 12) {
            Image(systemName: provider.systemImage)
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 4) {
                Text(provider.label).font(.title2.weight(.semibold))
                HStack(spacing: 8) {
                    AvailabilityPill(availability: provider.availability)
                    if let version = provider.version {
                        Text("v\(version)").font(.caption).foregroundStyle(.secondary)
                    }
                    if isPreferred {
                        Text("In use").font(.caption.weight(.semibold)).foregroundStyle(Color.accentColor)
                    }
                }
            }
        }
    }

    private func signIn(_ hint: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(provider?.availability == .notInstalled ? "Install and sign in" : "Sign in")
                .font(.headline)
            Text(hint)
                .font(.system(.callout, design: .monospaced))
                .textSelection(.enabled)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            HStack(spacing: 10) {
                Button(copied ? "Copied" : "Copy") {
                    MacHelpers.copy(hint)
                    copied = true
                }
                Button("Open Terminal") {
                    MacHelpers.openTerminal()
                }
                Spacer()
                Button("Check again") {
                    Task { await providerStore.refreshProviders() }
                }
            }
            .buttonStyle(.bordered)
            Text("Sign in there, then come back and check again. The app only reads the result.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func modelPicker(_ provider: ProviderDescriptor) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Model").font(.headline)
            Picker("Model", selection: $selectedModelKey) {
                ForEach(provider.models) { model in
                    Text(model.label).tag(model.key)
                }
            }
            .labelsHidden()
            .pickerStyle(.menu)
            .frame(maxWidth: 260, alignment: .leading)
        }
    }

    @ViewBuilder
    private func chooseButton(_ provider: ProviderDescriptor) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                Task {
                    await providerStore.choose(provider: provider.id, model: selectedModelKey.isEmpty ? nil : selectedModelKey)
                }
            } label: {
                Label(isPreferred ? "In use for the daily conversation" : "Use for the daily conversation", systemImage: "checkmark.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!provider.canRun || !providerStore.hasWorkspace || providerStore.isBusy)
            .accessibilityIdentifier("quiet-desk.providers.use")

            if !providerStore.hasWorkspace {
                Text("Choose a workspace folder in Settings › Workspace first.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if !provider.canRun {
                Text(provider.availability == .notInstalled
                    ? "Install it first; the app cannot choose a provider that is not on this Mac."
                    : "Sign in first; the app cannot choose a provider that has no session.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if let error = providerStore.lastError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }
}
