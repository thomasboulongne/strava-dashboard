import Foundation

/// Mirrors `Athlete` in src/lib/strava-types.ts (only the fields the app uses
/// are required; the rest are optional to tolerate API variation).
struct Athlete: Decodable, Identifiable {
    let id: Int
    let username: String?
    let firstname: String
    let lastname: String
    let city: String?
    let state: String?
    let country: String?
    let sex: String?
    let premium: Bool?
    let summit: Bool?
    let createdAt: String?
    let weight: Double?
    let profileMedium: String?
    let profile: String?
    let measurementPreference: String?
    let ftp: Int?

    var fullName: String {
        [firstname, lastname].filter { !$0.isEmpty }.joined(separator: " ")
    }

    var location: String? {
        let parts = [city, state, country].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    var profileURL: URL? {
        guard let profile, profile.hasPrefix("http") else { return nil }
        return URL(string: profile)
    }

    var memberSince: String? {
        guard let createdAt, let date = Formatters.parseISODate(createdAt) else { return nil }
        return Formatters.monthYear.string(from: date)
    }
}
