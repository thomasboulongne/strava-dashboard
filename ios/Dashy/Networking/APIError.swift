import Foundation

/// Mirrors the web client's `ApiError` (src/lib/api.ts): an error that carries
/// the HTTP status code so callers can special-case 401 (session expired).
enum APIError: LocalizedError {
    case invalidResponse
    case unauthorized
    case http(status: Int, message: String?)
    case decoding(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid server response."
        case .unauthorized:
            return "Session expired. Please sign in again."
        case let .http(status, message):
            return message ?? "Request failed with status \(status)."
        case let .decoding(error):
            return "Could not read server response: \(error.localizedDescription)"
        case let .transport(error):
            return error.localizedDescription
        }
    }

    var statusCode: Int? {
        switch self {
        case .unauthorized: return 401
        case let .http(status, _): return status
        default: return nil
        }
    }
}
