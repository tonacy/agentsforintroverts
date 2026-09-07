import QuietDeskCore
import SwiftUI

@MainActor
struct QuietDeskSettingsView: View {
    @Bindable var store: QuietDeskStore
    @Bindable var providerStore: ProviderStore

    var body: some View {
        TabView {
            Form {
                Section("Action safety") {
                    Toggle("Read-only mode", isOn: $store.readOnlyMode)
                    Text(
                        store.readOnlyMode
                            ? "No local approvals can be recorded."
                            : "Exact payloads may be approved locally, but this client still cannot contact a provider or claim delivery."
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                Section("Mac") {
                    Toggle("Show menu bar status", isOn: $store.menuBarEnabled)
                }
            }
            .formStyle(.grouped)
            .tabItem { Label("General", systemImage: "gearshape") }

            workspaceTab
                .tabItem { Label("Workspace", systemImage: "folder") }

            Form {
                Section("Future hub") {
                    TextField("Hub base URL", text: $store.hubBaseURLString)
                        .textFieldStyle(.roundedBorder)
                    if let validation = store.hubURLValidationMessage {
                        Label(validation, systemImage: "exclamationmark.triangle")
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                    Text("The bundled client accepts this URL as configuration only. It performs no network requests and contains no provider business logic.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Fixtures") {
                    Button("Reload bundled synthetic data") {
                        Task { await store.reload() }
                    }
                    LabeledContent("Mode", value: "Clearly synthetic JSON")
                    LabeledContent("Network", value: "Disabled in this client")
                }
            }
            .formStyle(.grouped)
            .tabItem { Label("Hub", systemImage: "network") }
        }
        .scenePadding()
        .frame(width: 560, height: 420)
    }

    private var workspaceTab: some View {
        let environment = providerStore.resolvedEnvironment()
        return Form {
            Section("Workspace folder") {
                pathRow(
                    label: "Workspace",
                    value: providerStore.workspacePath,
                    placeholder: "Not chosen",
                    choose: {
                        if let path = MacHelpers.chooseDirectory(
                            title: "Choose the Quiet Desk workspace",
                            message: "A private folder copied from templates/quiet-desk-publishing."
                        ) {
                            providerStore.workspacePath = path
                        }
                    }
                )
                Text("Your private copy of templates/quiet-desk-publishing. Captures, sources, places, and runs live here, outside the repository.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Runner") {
                pathRow(
                    label: "Repository",
                    value: providerStore.repoPathOverride ?? environment?.repoRoot.path,
                    placeholder: "Not found",
                    choose: {
                        if let path = MacHelpers.chooseDirectory(
                            title: "Choose the agentsforintroverts repository",
                            message: "The folder that contains services/runner."
                        ) {
                            providerStore.repoPathOverride = path
                        }
                    }
                )
                pathRow(
                    label: "Node",
                    value: providerStore.nodePathOverride ?? environment?.node.path,
                    placeholder: "Not found",
                    choose: {
                        if let path = MacHelpers.chooseFile(
                            title: "Choose the node executable",
                            message: "Usually under ~/.nvm/versions/node/…/bin/node or /opt/homebrew/bin/node."
                        ) {
                            providerStore.nodePathOverride = path
                        }
                    }
                )
                if providerStore.repoPathOverride != nil || providerStore.nodePathOverride != nil {
                    Button("Use detected paths") {
                        providerStore.repoPathOverride = nil
                        providerStore.nodePathOverride = nil
                    }
                    .controlSize(.small)
                }
                Text("Detected automatically when the app runs from the repository. Override only if detection fails.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Website") {
                pathRow(
                    label: "Day file",
                    value: providerStore.siteDayFilePath,
                    placeholder: "Set the repository first",
                    choose: {
                        if let path = MacHelpers.chooseFile(
                            title: "Choose the site's day file",
                            message: "Usually src/content/day.json in the repository."
                        ) {
                            providerStore.siteDayFileOverride = path
                        }
                    }
                )
                Text("Where an approved public day is written. The website is deployed separately.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
    }

    private func pathRow(label: String, value: String?, placeholder: String, choose: @escaping () -> Void) -> some View {
        LabeledContent(label) {
            HStack(spacing: 8) {
                Text(value ?? placeholder)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(value == nil ? .secondary : .primary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                Button("Choose…", action: choose)
                    .controlSize(.small)
            }
        }
    }
}
