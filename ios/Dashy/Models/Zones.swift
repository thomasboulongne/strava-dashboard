import Foundation

/// Mirrors `HeartRateZoneRange` / `PowerZoneRange` in src/lib/strava-types.ts.
struct ZoneRange: Decodable {
    let min: Int
    let max: Int
}

struct HeartRateZones: Decodable {
    let customZones: Bool?
    let zones: [ZoneRange]
}

struct PowerZones: Decodable {
    let zones: [ZoneRange]
}

struct AthleteZones: Decodable {
    let heartRate: HeartRateZones?
    let power: PowerZones?
}

struct AthleteZonesResponse: Decodable {
    let zones: AthleteZones
    let cached: Bool?
    let stale: Bool?
    let updatedAt: String?
}
