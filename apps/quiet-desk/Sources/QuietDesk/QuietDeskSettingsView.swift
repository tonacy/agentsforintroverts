import QuietDeskCore
import SwiftUI

@MainActor
struct QuietDeskSettingsView: View {
    @Bindable var store: QuietDeskStore

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
        .frame(width: 520, height: 330)
    }
}
