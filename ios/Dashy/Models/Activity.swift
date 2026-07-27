import Foundation

/// Map summary attached to an activity (src/lib/strava-types.ts `Activity.map`).
struct ActivityMap: Decodable {
    let id: String?
    let summaryPolyline: String?
}

/// Mirrors `Activity` in src/lib/strava-types.ts. Only the subset of fields the
/// app renders is modelled; everything optional is tolerant of missing data.
struct Activity: Decodable, Identifiable {
    let id: Int
    let name: String
    let distance: Double
    let movingTime: Double
    let elapsedTime: Double
    let totalElevationGain: Double
    let type: String
    let sportType: String?
    let startDate: String
    let startDateLocal: String
    let timezone: String?
    let locationCity: String?
    let locationState: String?
    let locationCountry: String?
    let achievementCount: Int?
    let kudosCount: Int?
    let map: ActivityMap?
    let trainer: Bool?
    let `private`: Bool?
    let startLatlng: [Double]?
    let endLatlng: [Double]?
    let averageSpeed: Double?
    let maxSpeed: Double?
    let averageCadence: Double?
    let averageWatts: Double?
    let weightedAverageWatts: Double?
    let kilojoules: Double?
    let calories: Double?
    let deviceWatts: Bool?
    let hasHeartrate: Bool?
    let averageHeartrate: Double?
    let maxHeartrate: Double?
    let elevHigh: Double?
    let elevLow: Double?
    let prCount: Int?
    let sufferScore: Double?
    /// Strava's owner-only private note. Present only on activities whose full
    /// detail has been fetched (recent-window refresh); read-only here because
    /// Strava's API has no supported way to write it.
    let privateNote: String?

    var startDateLocalParsed: Date? {
        Formatters.parseISODate(startDateLocal)
    }

    /// Distinguish indoor rides the same way chart-utils.ts `isIndoorRide` does.
    var isIndoorRide: Bool {
        if type == "VirtualRide" { return false }
        guard type == "Ride" || type == "EBikeRide" else { return false }
        let hasTrainerFlag = trainer == true
        let noGps = startLatlng == nil
        let noPolyline = (map?.summaryPolyline ?? "").isEmpty
        return hasTrainerFlag || (noGps && noPolyline)
    }

    /// Effective sport type used for grouping (chart-utils.ts `getEffectiveSportType`).
    var effectiveSportType: String {
        if isIndoorRide { return "IndoorRide" }
        return sportType ?? type
    }

    var hasRoute: Bool {
        !(map?.summaryPolyline ?? "").isEmpty
    }
}

/// SF Symbol + label helpers for activity types.
enum ActivitySport {
    static func symbol(for activity: Activity) -> String {
        switch activity.effectiveSportType {
        case "Run", "VirtualRun", "TrailRun":
            return "figure.run"
        case "Ride", "VirtualRide", "EBikeRide", "GravelRide", "MountainBikeRide":
            return "figure.outdoor.cycle"
        case "IndoorRide":
            return "figure.indoor.cycle"
        case "Swim":
            return "figure.pool.swim"
        case "Walk":
            return "figure.walk"
        case "Hike":
            return "figure.hiking"
        case "WeightTraining", "Crossfit", "Workout":
            return "dumbbell"
        case "Yoga":
            return "figure.yoga"
        case "AlpineSki", "BackcountrySki", "NordicSki", "Snowboard":
            return "figure.skiing.downhill"
        case "Rowing", "Kayaking", "Canoeing", "StandUpPaddling":
            return "figure.rower"
        default:
            return "figure.mixed.cardio"
        }
    }
}
