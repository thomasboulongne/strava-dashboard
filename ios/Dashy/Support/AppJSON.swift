import Foundation

extension JSONDecoder {
    /// Shared decoder used for every API response and cached payload. Strava
    /// JSON is snake_case, so keys are converted to camelCase to match the
    /// idiomatic model properties.
    static let dashy: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()
}
