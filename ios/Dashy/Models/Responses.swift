import Foundation

/// Mirrors `ActivitiesResponse` in src/lib/api.ts.
struct ActivitiesResponse: Decodable {
    let activities: [Activity]
    let total: Int
    let limit: Int
    let offset: Int
    let hasMore: Bool
}

/// Mirrors the streams/laps sub-progress shapes in src/lib/api.ts.
struct StreamsSyncProgress: Decodable {
    let total: Int
    let withStreams: Int
    let pending: Int
}

struct LapsSyncProgress: Decodable {
    let total: Int
    let withLaps: Int
    let pending: Int
}

/// Mirrors `SyncStatusResponse` in src/lib/api.ts.
struct SyncStatusResponse: Decodable {
    let activityCount: Int
    let latestActivityDate: String?
    let streams: StreamsSyncProgress?
    let laps: LapsSyncProgress?
}

/// Mirrors `SyncTriggerResponse` in src/lib/api.ts.
struct SyncTriggerResponse: Decodable {
    let status: String
    let reason: String?
    let totalSynced: Int?
    let activityCount: Int?
    let hasMore: Bool?
    let error: String?
}

/// App-only editable note for an activity (see netlify/functions/activity-notes.ts).
struct ActivityNoteResponse: Decodable {
    let note: String
}

/// Mirrors `RefreshActivitiesResponse` in src/lib/api.ts. Re-fetches recent
/// activity detail to pick up private notes / descriptions / renames that
/// Strava never delivers via webhooks.
struct RefreshTriggerResponse: Decodable {
    let status: String
    let refreshed: Int?
    let failed: Int?
    let error: String?
}
