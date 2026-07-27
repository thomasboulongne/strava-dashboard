import Foundation

/// Centralised formatting helpers mirroring the conventions used across the web
/// client (StatsOverview and chart-utils): metric units, compact counts, etc.
enum Formatters {
    // MARK: Date parsing

    private static let isoWithFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoStandard: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// Parses Strava ISO date strings, tolerating both `Z` and offset forms as
    /// well as the `YYYY-MM-DDTHH:MM:SSZ` shape used in start_date_local.
    static func parseISODate(_ string: String) -> Date? {
        if let date = isoStandard.date(from: string) { return date }
        if let date = isoWithFractional.date(from: string) { return date }
        // start_date_local often lacks a timezone; append Z and retry.
        if !string.hasSuffix("Z"), let date = isoStandard.date(from: string + "Z") {
            return date
        }
        return nil
    }

    static let monthYear: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM yyyy"
        return f
    }()

    static let mediumDate: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        return f
    }()

    static let dayMonth: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f
    }()

    // MARK: Metric formatting (mirrors StatsOverview helpers)

    /// Meters -> kilometers, with `k` compaction past 1000 km.
    static func distance(meters: Double) -> String {
        let km = meters / 1000
        if km >= 1000 {
            return String(format: "%.1fk", km / 1000)
        }
        return String(format: "%.0f", km)
    }

    /// Precise distance for a single activity, e.g. "42.2 km".
    static func distanceKm(meters: Double) -> String {
        String(format: "%.1f km", meters / 1000)
    }

    /// Seconds -> "1h 23m" / "45m", compacting to whole hours past 100h.
    static func duration(seconds: Double) -> String {
        let total = Int(seconds)
        let hours = total / 3600
        if hours >= 100 { return "\(hours)h" }
        let mins = (total % 3600) / 60
        return hours > 0 ? "\(hours)h \(mins)m" : "\(mins)m"
    }

    /// Seconds -> "1:23:45" / "23:45" for activity detail.
    static func clock(seconds: Double) -> String {
        let total = Int(seconds)
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        if h > 0 {
            return String(format: "%d:%02d:%02d", h, m, s)
        }
        return String(format: "%d:%02d", m, s)
    }

    static func elevation(meters: Double) -> String {
        if meters >= 100_000 {
            return String(format: "%.0fk", meters / 1000)
        }
        return String(format: "%.0f", meters)
    }

    static func count(_ value: Int) -> String {
        if value >= 1000 {
            return String(format: "%.1fk", Double(value) / 1000)
        }
        return "\(value)"
    }

    /// m/s -> km/h, e.g. "32.4".
    static func speedKph(metersPerSecond: Double) -> String {
        String(format: "%.1f", metersPerSecond * 3.6)
    }

    /// Pace in min/km for running, e.g. "4:35 /km".
    static func pacePerKm(metersPerSecond: Double) -> String {
        guard metersPerSecond > 0 else { return "--" }
        let secPerKm = 1000 / metersPerSecond
        let m = Int(secPerKm) / 60
        let s = Int(secPerKm) % 60
        return String(format: "%d:%02d /km", m, s)
    }
}
