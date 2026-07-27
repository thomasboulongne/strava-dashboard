import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var auth: AuthManager
    @StateObject private var viewModel = SettingsViewModel()
    @State private var showingLogoutConfirm = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Sync") {
                    if let status = viewModel.status {
                        LabeledContent("Activities", value: "\(status.activityCount)")
                        if let latest = viewModel.latestActivityText {
                            LabeledContent("Latest activity", value: latest)
                        }
                        if let streams = status.streams {
                            LabeledContent("Streams") {
                                Text("\(streams.withStreams)/\(streams.total)")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    } else if viewModel.isLoadingStatus {
                        ProgressView()
                    }

                    Button {
                        Task { await viewModel.sync() }
                    } label: {
                        HStack {
                            Label("Sync now", systemImage: "arrow.triangle.2.circlepath")
                            Spacer()
                            if viewModel.isSyncing { ProgressView() }
                        }
                    }
                    .disabled(viewModel.isSyncing)

                    Button {
                        Task {
                            await viewModel.refreshDetails()
                            await viewModel.loadStatus()
                        }
                    } label: {
                        HStack {
                            Label("Refresh recent details", systemImage: "note.text")
                            Spacer()
                            if viewModel.isRefreshingDetails { ProgressView() }
                        }
                    }
                    .disabled(viewModel.isRefreshingDetails)

                    if let message = viewModel.message {
                        Text(message)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Connection") {
                    LabeledContent("Server", value: AppConfig.baseURL.host() ?? AppConfig.baseURL.absoluteString)
                    if let id = auth.athleteId {
                        LabeledContent("Athlete ID", value: "\(id)")
                    }
                }

                Section {
                    Button(role: .destructive) {
                        showingLogoutConfirm = true
                    } label: {
                        Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Settings")
            .task { await viewModel.loadStatus() }
            .confirmationDialog("Sign out of Dashy?", isPresented: $showingLogoutConfirm, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { auth.logout() }
                Button("Cancel", role: .cancel) {}
            }
        }
    }
}
