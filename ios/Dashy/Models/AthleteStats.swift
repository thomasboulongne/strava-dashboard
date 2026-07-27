import Foundation

/// Mirrors `ActivityTotal` in src/lib/strava-types.ts.
struct ActivityTotal: Decodable {
    let count: Int
    let distance: Double
    let movingTime: Double
    let elapsedTime: Double
    let elevationGain: Double
}

/// Mirrors `AthleteStats` in src/lib/strava-types.ts.
struct AthleteStats: Decodable {
    let recentRideTotals: ActivityTotal
    let recentRunTotals: ActivityTotal
    let recentSwimTotals: ActivityTotal
    let ytdRideTotals: ActivityTotal
    let ytdRunTotals: ActivityTotal
    let ytdSwimTotals: ActivityTotal
    let allRideTotals: ActivityTotal
    let allRunTotals: ActivityTotal
    let allSwimTotals: ActivityTotal

    enum Period: String, CaseIterable, Identifiable {
        case recent, ytd, all
        var id: String { rawValue }

        var shortLabel: String {
            switch self {
            case .recent: return "4W"
            case .ytd: return "YTD"
            case .all: return "All"
            }
        }

        var longLabel: String {
            switch self {
            case .recent: return "Last 4 weeks"
            case .ytd: return "Year to date"
            case .all: return "All time"
            }
        }
    }

    func ride(_ period: Period) -> ActivityTotal {
        switch period {
        case .recent: return recentRideTotals
        case .ytd: return ytdRideTotals
        case .all: return allRideTotals
        }
    }

    func run(_ period: Period) -> ActivityTotal {
        switch period {
        case .recent: return recentRunTotals
        case .ytd: return ytdRunTotals
        case .all: return allRunTotals
        }
    }

    func swim(_ period: Period) -> ActivityTotal {
        switch period {
        case .recent: return recentSwimTotals
        case .ytd: return ytdSwimTotals
        case .all: return allSwimTotals
        }
    }

    // All-time highlight aggregates (sum across sports), matching StatsOverview.
    var totalActivities: Int {
        allRideTotals.count + allRunTotals.count + allSwimTotals.count
    }

    var totalDistance: Double {
        allRideTotals.distance + allRunTotals.distance + allSwimTotals.distance
    }

    var totalTime: Double {
        allRideTotals.movingTime + allRunTotals.movingTime + allSwimTotals.movingTime
    }

    var totalElevation: Double {
        allRideTotals.elevationGain + allRunTotals.elevationGain + allSwimTotals.elevationGain
    }
}
