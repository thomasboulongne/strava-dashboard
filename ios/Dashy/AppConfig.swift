import Foundation

/// Static app configuration.
///
/// `apiBaseURL` must point at the deployed Netlify site that hosts the Dashy
/// backend functions. All requests are made against `<apiBaseURL>/api/*`,
/// matching the web client's `API_BASE` in `src/lib/api.ts`.
///
/// For local development against `netlify dev`, point this at your machine's
/// LAN address (e.g. `http://192.168.1.20:8888`) so a physical device can reach
/// it. `http://localhost:8888` only works in the simulator.
enum AppConfig {
    /// Base site URL, e.g. `https://your-site.netlify.app`.
    /// Override at launch with the `DASHY_BASE_URL` environment variable.
    static let baseURL: URL = {
        if let override = ProcessInfo.processInfo.environment["DASHY_BASE_URL"],
           let url = URL(string: override) {
            return url
        }
        return URL(string: "https://dashy-analytics.netlify.app/")!
    }()

    /// Base URL for API calls (`<baseURL>/api`).
    static var apiBaseURL: URL {
        baseURL.appendingPathComponent("api")
    }
}
