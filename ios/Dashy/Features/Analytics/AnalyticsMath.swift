import Foundation

/// Pure analytics helpers ported from src/lib/chart-utils.ts: weekly volume,
/// daily consistency, acute/chronic training load, and HR-zone time.
enum AnalyticsMath {
    static var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.firstWeekday = 2 // Monday, matching getWeekStart()
        return c
    }()

    static func startOfDay(_ date: Date) -> Date {
        calendar.startOfDay(for: date)
    }

    /// Monday of the week containing `date` (chart-utils.ts `getWeekStart`).
    static func weekStart(_ date: Date) -> Date {
        let comps = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        return calendar.date(from: comps) ?? startOfDay(date)
    }

    // MARK: Weekly volume

    struct WeeklyVolume: Identifiable {
        var id: Date { weekStart }
        let weekStart: Date
        let hours: Double
    }

    static func weeklyVolume(_ activities: [Activity], weeks: Int) -> [WeeklyVolume] {
        let thisWeek = weekStart(Date())
        var buckets: [Date: Double] = [:]
        var order: [Date] = []
        for offset in stride(from: weeks - 1, through: 0, by: -1) {
            guard let week = calendar.date(byAdding: .weekOfYear, value: -offset, to: thisWeek) else { continue }
            buckets[week] = 0
            order.append(week)
        }

        for activity in activities {
            guard let date = activity.startDateLocalParsed else { continue }
            let week = weekStart(date)
            if buckets[week] != nil {
                buckets[week]! += activity.movingTime / 3600
            }
        }

        return order.map { WeeklyVolume(weekStart: $0, hours: buckets[$0] ?? 0) }
    }

    // MARK: Consistency heatmap

    struct DailyActivity: Identifiable {
        var id: Date { date }
        let date: Date
        let minutes: Double
        /// 0 = none, 1 = 1-30, 2 = 31-60, 3 = 61-120, 4 = 120+
        let intensityBin: Int
    }

    static func dailyMinutes(_ activities: [Activity], days: Int) -> [DailyActivity] {
        let today = startOfDay(Date())
        var buckets: [Date: Double] = [:]
        var order: [Date] = []
        for offset in stride(from: days - 1, through: 0, by: -1) {
            guard let day = calendar.date(byAdding: .day, value: -offset, to: today) else { continue }
            buckets[day] = 0
            order.append(day)
        }

        for activity in activities {
            guard let date = activity.startDateLocalParsed else { continue }
            let day = startOfDay(date)
            if buckets[day] != nil {
                buckets[day]! += activity.movingTime / 60
            }
        }

        return order.map { day in
            let minutes = buckets[day] ?? 0
            return DailyActivity(date: day, minutes: minutes, intensityBin: intensityBin(minutes))
        }
    }

    private static func intensityBin(_ minutes: Double) -> Int {
        if minutes == 0 { return 0 }
        if minutes <= 30 { return 1 }
        if minutes <= 60 { return 2 }
        if minutes <= 120 { return 3 }
        return 4
    }

    // MARK: Training load (acute/chronic)

    struct LoadPoint: Identifiable {
        var id: Date { date }
        let date: Date
        let acute: Double
        let chronic: Double
    }

    private static let sportWeights: [String: Double] = [
        "Run": 1.2, "Ride": 1.0, "Swim": 0.8,
    ]

    private static func loadWeight(for activity: Activity) -> Double {
        switch activity.type {
        case "Run", "VirtualRun", "TrailRun": return sportWeights["Run"]!
        case "Ride", "VirtualRide", "EBikeRide", "GravelRide", "MountainBikeRide": return sportWeights["Ride"]!
        case "Swim": return sportWeights["Swim"]!
        default: return 1.0
        }
    }

    static func trainingLoad(_ activities: [Activity], days: Int) -> [LoadPoint] {
        let today = startOfDay(Date())
        // Include 27 warm-up days before the visible window for the chronic sum.
        let totalDays = days + 27
        var dailyLoad: [Date: Double] = [:]
        var order: [Date] = []
        for offset in stride(from: totalDays - 1, through: 0, by: -1) {
            guard let day = calendar.date(byAdding: .day, value: -offset, to: today) else { continue }
            dailyLoad[day] = 0
            order.append(day)
        }

        for activity in activities {
            guard let date = activity.startDateLocalParsed else { continue }
            let day = startOfDay(date)
            if dailyLoad[day] != nil {
                dailyLoad[day]! += (activity.movingTime / 60) * loadWeight(for: activity)
            }
        }

        let loads = order.map { dailyLoad[$0] ?? 0 }
        var points: [LoadPoint] = []
        for index in order.indices {
            let acuteStart = max(0, index - 6)
            let acute = loads[acuteStart...index].reduce(0, +)
            let chronicStart = max(0, index - 27)
            let chronicSum = loads[chronicStart...index].reduce(0, +)
            let chronicNormalized = (chronicSum / 28) * 7
            points.append(LoadPoint(date: order[index], acute: acute, chronic: chronicNormalized))
        }

        // Drop the warm-up prefix so only the requested window is shown.
        return Array(points.suffix(days))
    }

    // MARK: HR zone distribution

    struct ZoneSlice: Identifiable {
        var id: Int { zone }
        let zone: Int
        let label: String
        let seconds: Double
        let percentage: Double
        let colorHex: String
    }

    static let hrZoneColors = ["#94a3b8", "#22c55e", "#eab308", "#f97316", "#ef4444"]
    static let hrZoneLabels = ["Z1", "Z2", "Z3", "Z4", "Z5"]

    private static func zoneIndex(_ value: Double, _ zones: [ZoneRange]) -> Int {
        for (i, zone) in zones.enumerated() where value >= Double(zone.min) && value < Double(zone.max) {
            return i
        }
        if let last = zones.last, value >= Double(last.max) { return zones.count - 1 }
        return 0
    }

    static func hrZoneDistribution(
        streams: [ActivityStreams],
        zones: [ZoneRange]
    ) -> [ZoneSlice] {
        guard !zones.isEmpty else { return [] }
        var zoneSeconds = [Double](repeating: 0, count: zones.count)

        for stream in streams {
            guard let hr = stream.heartrate?.data, let time = stream.time?.data,
                  hr.count == time.count, hr.count > 1 else { continue }
            for i in 1..<hr.count {
                let delta = time[i] - time[i - 1]
                if delta > 0 && delta < 300 {
                    zoneSeconds[zoneIndex(hr[i], zones)] += delta
                }
            }
        }

        let total = zoneSeconds.reduce(0, +)
        guard total > 0 else { return [] }

        return zones.indices.map { i in
            ZoneSlice(
                zone: i + 1,
                label: i < hrZoneLabels.count ? hrZoneLabels[i] : "Z\(i + 1)",
                seconds: zoneSeconds[i],
                percentage: zoneSeconds[i] / total * 100,
                colorHex: i < hrZoneColors.count ? hrZoneColors[i] : hrZoneColors.last!
            )
        }
    }
}
