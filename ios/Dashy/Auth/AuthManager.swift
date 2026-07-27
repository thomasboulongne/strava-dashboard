import Foundation

/// Owns the authentication state and the session token lifecycle. Mirrors the
/// web client's combination of `authStore`, `useSessionCapture`, and the token
/// refresh logic in src/lib/api.ts.
@MainActor
final class AuthManager: ObservableObject, TokenProviding {
    enum State: Equatable {
        case unknown
        case signedOut
        case signedIn
    }

    @Published private(set) var state: State = .unknown
    @Published private(set) var athleteId: Int?

    private var token: SessionToken?

    init() {
        Task { await APIClient.shared.setTokenProvider(self) }
    }

    // MARK: - Lifecycle

    /// Loads any persisted session on launch (mirrors restoring `strava_session`).
    func restore() async {
        guard state == .unknown else { return }
        if let stored = KeychainStore.load() {
            token = stored
            athleteId = stored.athleteId
            state = .signedIn
        } else {
            state = .signedOut
        }
    }

    /// Completes login after capturing the `#session=` payload from the web flow.
    func completeLogin(with session: SessionToken) {
        token = session
        athleteId = session.athleteId
        KeychainStore.save(session)
        state = .signedIn
    }

    func logout() {
        token = nil
        athleteId = nil
        KeychainStore.clear()
        DiskCache.clearAll()
        state = .signedOut
    }

    // MARK: - TokenProviding

    func currentAccessToken() async -> String? {
        token?.accessToken
    }

    func currentAthleteId() async -> Int? {
        token?.athleteId
    }

    func refreshTokens() async -> Bool {
        guard let refreshToken = token?.refreshToken, !refreshToken.isEmpty else {
            return false
        }

        var request = URLRequest(url: AppConfig.apiBaseURL.appendingPathComponent("refresh"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(["refreshToken": refreshToken])

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return false
            }
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            let refreshed = try decoder.decode(RefreshResponse.self, from: data)

            var updated = token ?? SessionToken(
                athleteId: refreshed.athleteId ?? 0,
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken ?? refreshToken,
                expiresAt: refreshed.expiresAt
            )
            updated.accessToken = refreshed.accessToken
            updated.expiresAt = refreshed.expiresAt
            if let newRefresh = refreshed.refreshToken { updated.refreshToken = newRefresh }
            if let id = refreshed.athleteId { updated.athleteId = id }

            token = updated
            athleteId = updated.athleteId
            KeychainStore.save(updated)
            return true
        } catch {
            return false
        }
    }

    func handleAuthFailure() async {
        logout()
    }

    private struct RefreshResponse: Decodable {
        let success: Bool?
        let accessToken: String
        let refreshToken: String?
        let expiresAt: Int
        let athleteId: Int?
    }
}
