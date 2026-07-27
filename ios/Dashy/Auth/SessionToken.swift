import Foundation

/// Mirrors the web client's `StoredSession` (src/hooks/useSessionCapture.ts):
/// the token bundle delivered via the OAuth callback's `#session=` fragment.
struct SessionToken: Codable, Equatable {
    var athleteId: Int
    var accessToken: String
    var refreshToken: String
    /// Unix seconds at which the access token expires.
    var expiresAt: Int

    /// Matches `isSessionValid()` in useSessionCapture.ts: valid if more than
    /// 5 minutes of life remains.
    var isValid: Bool {
        let now = Int(Date().timeIntervalSince1970)
        return expiresAt > now + 300
    }

    /// Decodes the base64-encoded JSON payload from the callback URL fragment.
    static func fromFragmentPayload(_ base64: String) -> SessionToken? {
        guard let data = Data(base64Encoded: base64) else { return nil }
        return try? JSONDecoder().decode(SessionToken.self, from: data)
    }
}
