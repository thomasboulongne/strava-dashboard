import Foundation

/// Mirrors the training-plan shapes in src/lib/strava-types.ts. Decoded with the
/// shared `.convertFromSnakeCase` strategy, so DB snake_case fields map to
/// camelCase here while the already-camelCase compliance keys pass through.
///
/// Note: Neon returns `bigint` columns (athlete_id, activity ids,
/// matched_activity_id) as JSON strings, so id fields are decoded flexibly from
/// either a number or a numeric string.

/// Decodes an Int that may arrive as a JSON number or a numeric string.
private func flexibleInt<K>(_ c: KeyedDecodingContainer<K>, _ key: K) throws -> Int {
    if let i = try? c.decode(Int.self, forKey: key) { return i }
    if let s = try? c.decode(String.self, forKey: key), let i = Int(s) { return i }
    throw DecodingError.dataCorruptedError(
        forKey: key, in: c, debugDescription: "Expected Int or numeric String"
    )
}

/// Like `flexibleInt` but returns nil when the key is missing, null, or invalid.
private func flexibleIntIfPresent<K>(_ c: KeyedDecodingContainer<K>, _ key: K) -> Int? {
    if let i = try? c.decode(Int.self, forKey: key) { return i }
    if let s = try? c.decode(String.self, forKey: key) { return Int(s) }
    return nil
}

// MARK: - Compliance

struct HRDetails: Decodable {
    let actualAvg: Double
    let targetZone: Int
    let targetMin: Double
    let targetMax: Double
    let direction: String // on_target | too_low | too_high
}

struct PowerDetails: Decodable {
    let actualAvg: Double
    let targetZone: Int
    let targetMin: Double
    let targetMax: Double
    let direction: String
}

struct IntervalResult: Decodable, Identifiable {
    let index: Int
    let durationSec: Double
    let targetDurationSec: Double
    let avgHR: Double
    let maxHR: Double?
    let avgPower: Double?
    let targetZone: Int
    let status: String // completed | too_short | too_long | wrong_zone | missing
    let lapIndex: Int?

    var id: Int { index }
}

struct IntervalCompliance: Decodable {
    let expected: Int
    let completed: Int
    let score: Double
    let targetDurationSec: Double
    let targetZone: Int
    let source: String // laps | hr_detection | power_detection
    let intervals: [IntervalResult]
}

struct ComplianceBreakdown: Decodable {
    let duration: Double?
    let durationRatio: Double?
    let hrZone: Double?
    let hrDetails: HRDetails?
    let powerZone: Double?
    let powerDetails: PowerDetails?
    let intervals: IntervalCompliance?
    let activityDone: Double?
}

struct ComplianceScore: Decodable {
    let score: Double
    let breakdown: ComplianceBreakdown
}

// MARK: - Workouts

struct MatchedActivity: Decodable {
    let id: Int
    let data: Activity

    enum CodingKeys: String, CodingKey { case id, data }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try flexibleInt(c, .id)
        data = try c.decode(Activity.self, forKey: .data)
    }
}

struct UnmatchedActivity: Decodable, Identifiable {
    let id: Int
    let data: Activity

    enum CodingKeys: String, CodingKey { case id, data }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try flexibleInt(c, .id)
        data = try c.decode(Activity.self, forKey: .data)
    }
}

/// A planned workout with its (optional) matched activity and compliance score,
/// mirroring `TrainingWorkoutWithMatch`.
struct TrainingWorkout: Decodable, Identifiable {
    let id: Int
    let athleteId: Int?
    let workoutDate: String // YYYY-MM-DD
    let sessionName: String
    let durationTargetMinutes: Int?
    let intensityTarget: String?
    let notes: String?
    let dayOrder: Int?
    let timeOfDay: String?
    let workoutText: String?
    let icuSyncError: String?
    let isManuallyLinked: Bool?
    let matchedActivityId: Int?
    let matchedActivity: MatchedActivity?
    let compliance: ComplianceScore?

    enum CodingKeys: String, CodingKey {
        case id, athleteId, workoutDate, sessionName, durationTargetMinutes
        case intensityTarget, notes, dayOrder, timeOfDay, workoutText
        case icuSyncError, isManuallyLinked, matchedActivityId, matchedActivity, compliance
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try flexibleInt(c, .id)
        athleteId = flexibleIntIfPresent(c, .athleteId)
        // workout_date may come back as "YYYY-MM-DD" or a full ISO timestamp.
        let rawDate = try c.decode(String.self, forKey: .workoutDate)
        workoutDate = String(rawDate.prefix(10))
        sessionName = try c.decode(String.self, forKey: .sessionName)
        durationTargetMinutes = flexibleIntIfPresent(c, .durationTargetMinutes)
        intensityTarget = try c.decodeIfPresent(String.self, forKey: .intensityTarget)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        dayOrder = flexibleIntIfPresent(c, .dayOrder)
        timeOfDay = try c.decodeIfPresent(String.self, forKey: .timeOfDay)
        workoutText = try c.decodeIfPresent(String.self, forKey: .workoutText)
        icuSyncError = try c.decodeIfPresent(String.self, forKey: .icuSyncError)
        isManuallyLinked = try c.decodeIfPresent(Bool.self, forKey: .isManuallyLinked)
        matchedActivityId = flexibleIntIfPresent(c, .matchedActivityId)
        matchedActivity = try c.decodeIfPresent(MatchedActivity.self, forKey: .matchedActivity)
        compliance = try c.decodeIfPresent(ComplianceScore.self, forKey: .compliance)
    }
}

// MARK: - Responses

struct TrainingPlanResponse: Decodable {
    let workouts: [TrainingWorkout]
    let unmatchedActivities: [UnmatchedActivity]
    let weekStart: String
}

struct LinkActivityResponse: Decodable {
    let success: Bool
}

struct SuccessResponse: Decodable {
    let success: Bool?
}
