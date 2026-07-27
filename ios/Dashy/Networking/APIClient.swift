import Foundation

/// Supplies the current access token and performs a refresh on demand.
/// Implemented by `AuthManager`; kept as a protocol so `APIClient` doesn't
/// depend on the concrete auth type.
protocol TokenProviding: AnyObject {
    func currentAccessToken() async -> String?
    /// The authenticated athlete's id, used to populate the `strava_athlete_id`
    /// cookie that several endpoints read from to scope DB queries.
    func currentAthleteId() async -> Int?
    /// Attempt to refresh the access token. Returns true on success.
    func refreshTokens() async -> Bool
    /// Called when authentication is irrecoverable (refresh failed) so the
    /// UI can return to the login screen.
    func handleAuthFailure() async
}

/// Thin networking layer over the Netlify functions, mirroring `fetchApi`
/// in src/lib/api.ts: it injects the Bearer token, and on a 401 it refreshes
/// the token once and retries before giving up.
actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder = JSONDecoder.dashy
    weak var tokenProvider: TokenProviding?

    init(session: URLSession = .shared) {
        self.session = session
    }

    func setTokenProvider(_ provider: TokenProviding) {
        self.tokenProvider = provider
    }

    // MARK: - Public requests

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await request(path, method: "GET", query: query, body: nil)
    }

    /// Returns the raw validated JSON body for a GET, for callers that want to
    /// persist it to the disk cache and decode separately.
    func getData(_ path: String, query: [URLQueryItem] = []) async throws -> Data {
        try await requestData(path, method: "GET", query: query, body: nil)
    }

    @discardableResult
    func post<T: Decodable>(_ path: String, body: Data? = nil) async throws -> T {
        try await request(path, method: "POST", query: [], body: body)
    }

    @discardableResult
    func patch<T: Decodable>(_ path: String, body: Data? = nil) async throws -> T {
        try await request(path, method: "PATCH", query: [], body: body)
    }

    @discardableResult
    func put<T: Decodable>(_ path: String, body: Data? = nil) async throws -> T {
        try await request(path, method: "PUT", query: [], body: body)
    }

    @discardableResult
    func delete<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await request(path, method: "DELETE", query: query, body: nil)
    }

    // MARK: - Core

    private func request<T: Decodable>(
        _ path: String,
        method: String,
        query: [URLQueryItem],
        body: Data?,
        isRetry: Bool = false
    ) async throws -> T {
        let data = try await requestData(path, method: method, query: query, body: body, isRetry: isRetry)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    /// Performs the request and returns the raw validated body (handles auth,
    /// 401 refresh+retry, and HTTP error mapping), leaving decoding to callers.
    private func requestData(
        _ path: String,
        method: String,
        query: [URLQueryItem],
        body: Data?,
        isRetry: Bool = false
    ) async throws -> Data {
        let request = try await buildRequest(path: path, method: method, query: query, body: body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if http.statusCode == 401 {
            if !isRetry, let provider = tokenProvider, await provider.refreshTokens() {
                return try await requestData(path, method: method, query: query, body: body, isRetry: true)
            }
            await tokenProvider?.handleAuthFailure()
            throw APIError.unauthorized
        }

        guard (200..<300).contains(http.statusCode) else {
            let message = Self.extractError(from: data)
            throw APIError.http(status: http.statusCode, message: message)
        }

        return data
    }

    private func buildRequest(
        path: String,
        method: String,
        query: [URLQueryItem],
        body: Data?
    ) async throws -> URLRequest {
        var components = URLComponents(
            url: AppConfig.apiBaseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        )
        if !query.isEmpty {
            components?.queryItems = query
        }
        guard let url = components?.url else {
            throw APIError.invalidResponse
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        if let token = await tokenProvider?.currentAccessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        // Several functions resolve the athlete from the `strava_athlete_id`
        // cookie. We send no real cookies (Bearer auth), so synthesize it from
        // the session. Disable automatic cookie handling so this header sticks.
        if let athleteId = await tokenProvider?.currentAthleteId(), athleteId != 0 {
            request.httpShouldHandleCookies = false
            request.setValue("strava_athlete_id=\(athleteId)", forHTTPHeaderField: "Cookie")
        }
        return request
    }

    private static func extractError(from data: Data) -> String? {
        guard
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let message = object["error"] as? String
        else {
            return nil
        }
        return message
    }
}
