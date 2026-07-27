import Foundation

/// Week math and date helpers for the training plan, ported from
/// src/hooks/useTrainingPlan.ts. Weeks start on Monday and are identified by a
/// `YYYY-MM-DD` string (the Monday's date), matching the backend.
enum WeekDate {
    static var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.firstWeekday = 2 // Monday
        return c
    }()

    private static let ymdFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func formatYMD(_ date: Date) -> String {
        ymdFormatter.string(from: date)
    }

    static func parseYMD(_ string: String) -> Date? {
        ymdFormatter.date(from: string)
    }

    /// Monday (start of week) for the given date, as a `YYYY-MM-DD` string.
    static func weekStart(of date: Date = Date()) -> String {
        let comps = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        let monday = calendar.date(from: comps) ?? calendar.startOfDay(for: date)
        return formatYMD(monday)
    }

    static func nextWeek(_ weekStart: String) -> String {
        guard let date = parseYMD(weekStart),
              let next = calendar.date(byAdding: .day, value: 7, to: date) else { return weekStart }
        return formatYMD(next)
    }

    static func previousWeek(_ weekStart: String) -> String {
        guard let date = parseYMD(weekStart),
              let prev = calendar.date(byAdding: .day, value: -7, to: date) else { return weekStart }
        return formatYMD(prev)
    }

    /// The seven dates (Mon-Sun) of the week.
    static func weekDates(_ weekStart: String) -> [Date] {
        guard let start = parseYMD(weekStart) else { return [] }
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    /// Human-readable week range, e.g. "Jan 5 - 11, 2026" or "Dec 30 - Jan 5, 2026".
    static func formatWeekRange(_ weekStart: String) -> String {
        guard let start = parseYMD(weekStart),
              let end = calendar.date(byAdding: .day, value: 6, to: start) else { return weekStart }

        let month = DateFormatter()
        month.locale = Locale(identifier: "en_US_POSIX")
        month.dateFormat = "MMM"

        let startMonth = month.string(from: start)
        let endMonth = month.string(from: end)
        let startDay = calendar.component(.day, from: start)
        let endDay = calendar.component(.day, from: end)
        let year = calendar.component(.year, from: start)

        if startMonth == endMonth {
            return "\(startMonth) \(startDay) - \(endDay), \(year)"
        }
        return "\(startMonth) \(startDay) - \(endMonth) \(endDay), \(year)"
    }

    /// Parses a flexible duration string into minutes ("90", "1:30", "1h30m").
    /// Mirrors the web edit form's parseDuration. Returns nil if blank/invalid.
    static func parseDuration(_ raw: String) -> Int? {
        let trimmed = raw.trimmingCharacters(in: .whitespaces).lowercased()
        guard !trimmed.isEmpty else { return nil }

        // "1:30" -> 1h 30m
        if trimmed.contains(":") {
            let parts = trimmed.split(separator: ":", maxSplits: 1).map { Int($0) }
            if parts.count == 2, let h = parts[0], let m = parts[1] {
                return h * 60 + m
            }
            return nil
        }

        // "1h30m" / "1h" / "30m"
        if trimmed.contains("h") || trimmed.contains("m") {
            var minutes = 0
            var matched = false
            if let hRange = trimmed.range(of: "h") {
                let hChunk = trimmed[trimmed.startIndex..<hRange.lowerBound]
                if let h = Int(hChunk) { minutes += h * 60; matched = true }
                let rest = trimmed[hRange.upperBound...].replacingOccurrences(of: "m", with: "")
                if let m = Int(rest), !rest.isEmpty { minutes += m; matched = true }
            } else if let mRange = trimmed.range(of: "m") {
                let mChunk = trimmed[trimmed.startIndex..<mRange.lowerBound]
                if let m = Int(mChunk) { minutes += m; matched = true }
            }
            return matched ? minutes : nil
        }

        // Plain number of minutes.
        return Int(trimmed)
    }

    /// Formats minutes as "H:MM" or "MMm", mirroring the workout card.
    static func formatTargetDuration(_ minutes: Int) -> String {
        let h = minutes / 60
        let m = minutes % 60
        if h > 0 {
            return String(format: "%d:%02d", h, m)
        }
        return "\(m)m"
    }
}
