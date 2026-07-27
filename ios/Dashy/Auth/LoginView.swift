import SwiftUI

/// Mirrors the web client's Home/login screen: a single "Connect with Strava"
/// action that launches the OAuth flow and captures the resulting session.
struct LoginView: View {
    @EnvironmentObject private var auth: AuthManager

    @State private var authURL: URL?
    @State private var isLoadingURL = false
    @State private var showingWebAuth = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 16) {
                Image(systemName: "chart.bar.xaxis")
                    .font(.system(size: 64))
                    .foregroundStyle(.dashyOrange)
                Text("Dashy")
                    .font(.largeTitle.bold())
                Text("View your activity stats in a beautiful dashboard")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Button(action: startLogin) {
                HStack {
                    if isLoadingURL {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "bolt.fill")
                    }
                    Text("Connect with Strava")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.dashyOrange)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(isLoadingURL)
            .padding(.horizontal, 32)

            Text("We only read your activity data.")
                .font(.footnote)
                .foregroundStyle(.secondary)

            Spacer()
        }
        .padding()
        .sheet(isPresented: $showingWebAuth) {
            if let authURL {
                NavigationStack {
                    WebAuthView(
                        startURL: authURL,
                        onSession: { token in
                            showingWebAuth = false
                            auth.completeLogin(with: token)
                        },
                        onError: { message in
                            showingWebAuth = false
                            errorMessage = message
                        }
                    )
                    .ignoresSafeArea(edges: .bottom)
                    .navigationTitle("Sign in")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { showingWebAuth = false }
                        }
                    }
                }
            }
        }
    }

    private func startLogin() {
        errorMessage = nil
        isLoadingURL = true
        Task {
            do {
                let response: AuthURLResponse = try await APIClient.shared.get("auth")
                if let url = URL(string: response.url) {
                    authURL = url
                    showingWebAuth = true
                } else {
                    errorMessage = "Could not start sign in."
                }
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
            isLoadingURL = false
        }
    }
}

private struct AuthURLResponse: Decodable {
    let url: String
}
