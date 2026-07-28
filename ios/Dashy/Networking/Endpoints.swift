import Foundation

/// Typed wrappers over the Netlify function endpoints, mirroring the exported
/// functions in src/lib/api.ts.
enum DashyAPI {
    static func athlete() async throws -> Athlete {
        try await APIClient.shared.get("athlete")
    }

    static func stats(athleteId: Int) async throws -> AthleteStats {
        try await APIClient.shared.get("stats", query: [
            URLQueryItem(name: "athleteId", value: String(athleteId))
        ])
    }

    static func activities(limit: Int = 200, offset: Int = 0) async throws -> ActivitiesResponse {
        try await APIClient.shared.get("activities", query: [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
        ])
    }

    static func zones() async throws -> AthleteZonesResponse {
        try await APIClient.shared.get("zones")
    }

    static func activityStreams(activityIds: [Int]) async throws -> ActivityStreamsResponse {
        try await APIClient.shared.get("activity-streams", query: [
            URLQueryItem(name: "activityIds", value: activityIds.map(String.init).joined(separator: ","))
        ])
    }

    /// Fetches the app-only editable note for an activity (stored in our DB,
    /// separate from Strava's read-only private note).
    static func activityNote(activityId: Int) async throws -> ActivityNoteResponse {
        try await APIClient.shared.get("activity-notes", query: [
            URLQueryItem(name: "activityId", value: String(activityId))
        ])
    }

    /// Saves the app-only editable note for an activity.
    @discardableResult
    static func updateActivityNote(activityId: Int, note: String) async throws -> ActivityNoteResponse {
        let body = try jsonBody([
            "activityId": activityId,
            "note": note,
        ])
        return try await APIClient.shared.put("activity-notes", body: body)
    }

    static func syncStatus() async throws -> SyncStatusResponse {
        try await APIClient.shared.get("sync")
    }

    @discardableResult
    static func triggerSync() async throws -> SyncTriggerResponse {
        try await APIClient.shared.post("sync")
    }

    /// Re-fetches recent activity detail so owner-only edits (private notes,
    /// descriptions, renames) that don't fire Strava webhooks show up.
    @discardableResult
    static func triggerActivityRefresh() async throws -> RefreshTriggerResponse {
        try await APIClient.shared.post("refresh-activities")
    }

    // MARK: - Training plan

    static func trainingPlan(week: String) async throws -> TrainingPlanResponse {
        try await APIClient.shared.get("training-plans", query: [
            URLQueryItem(name: "week", value: week)
        ])
    }

    @discardableResult
    static func linkActivity(workoutId: Int, activityId: Int) async throws -> LinkActivityResponse {
        let body = try jsonBody(["activityId": activityId])
        return try await APIClient.shared.patch("training-plans/\(workoutId)/link", body: body)
    }

    @discardableResult
    static func unlinkActivity(workoutId: Int) async throws -> LinkActivityResponse {
        try await APIClient.shared.patch("training-plans/\(workoutId)/unlink")
    }

    @discardableResult
    static func createWorkout(
        workoutDate: String,
        sessionName: String,
        durationTargetMinutes: Int?,
        intensityTarget: String?,
        notes: String?,
        timeOfDay: String?
    ) async throws -> LinkActivityResponse {
        let body = try jsonBody([
            "workout_date": workoutDate,
            "session_name": sessionName,
            "duration_target_minutes": durationTargetMinutes ?? NSNull(),
            "intensity_target": intensityTarget ?? NSNull(),
            "notes": notes ?? NSNull(),
            "time_of_day": timeOfDay ?? NSNull(),
        ])
        return try await APIClient.shared.post("training-plans/workout", body: body)
    }

    @discardableResult
    static func updateWorkout(
        workoutId: Int,
        sessionName: String,
        durationTargetMinutes: Int?,
        intensityTarget: String?,
        notes: String?,
        timeOfDay: String?
    ) async throws -> LinkActivityResponse {
        let body = try jsonBody([
            "session_name": sessionName,
            "duration_target_minutes": durationTargetMinutes ?? NSNull(),
            "intensity_target": intensityTarget ?? NSNull(),
            "notes": notes ?? NSNull(),
            "time_of_day": timeOfDay ?? NSNull(),
        ])
        return try await APIClient.shared.patch("training-plans/\(workoutId)", body: body)
    }

    @discardableResult
    static func deleteWorkout(id: Int) async throws -> SuccessResponse {
        try await APIClient.shared.delete("training-plans/\(id)")
    }

    @discardableResult
    static func deletePlan(week: String) async throws -> SuccessResponse {
        try await APIClient.shared.delete("training-plans", query: [
            URLQueryItem(name: "week", value: week)
        ])
    }

    // MARK: - Objectives (calendar)

    static func objectives(from: String? = nil, to: String? = nil) async throws -> ObjectivesResponse {
        var query: [URLQueryItem] = []
        if let from { query.append(URLQueryItem(name: "from", value: from)) }
        if let to { query.append(URLQueryItem(name: "to", value: to)) }
        return try await APIClient.shared.get("objectives", query: query)
    }

    @discardableResult
    static func createObjective(
        title: String,
        objectiveType: String,
        startDate: String,
        endDate: String?,
        priority: String?,
        notes: String?
    ) async throws -> SuccessResponse {
        let body = try jsonBody([
            "title": title,
            "objective_type": objectiveType,
            "start_date": startDate,
            "end_date": endDate ?? NSNull(),
            "priority": priority ?? NSNull(),
            "notes": notes ?? NSNull(),
        ])
        return try await APIClient.shared.post("objectives", body: body)
    }

    @discardableResult
    static func updateObjective(
        id: Int,
        title: String,
        objectiveType: String,
        startDate: String,
        endDate: String?,
        priority: String?,
        notes: String?
    ) async throws -> SuccessResponse {
        let body = try jsonBody([
            "title": title,
            "objective_type": objectiveType,
            "start_date": startDate,
            "end_date": endDate ?? NSNull(),
            "priority": priority ?? NSNull(),
            "notes": notes ?? NSNull(),
        ])
        return try await APIClient.shared.patch("objectives/\(id)", body: body)
    }

    @discardableResult
    static func deleteObjective(id: Int) async throws -> SuccessResponse {
        try await APIClient.shared.delete("objectives/\(id)")
    }

    // MARK: - Macro plans + training blocks

    static func macroPlans() async throws -> MacroPlansResponse {
        try await APIClient.shared.get("macro-plans")
    }

    static func activeMacroPlan() async throws -> MacroPlanResponse {
        try await APIClient.shared.get("macro-plans", query: [
            URLQueryItem(name: "active", value: "1")
        ])
    }

    @discardableResult
    static func createMacroPlan(
        name: String,
        startDate: String,
        endDate: String,
        goal: String?,
        goalObjectiveId: Int?,
        isActive: Bool,
        notes: String?
    ) async throws -> SuccessResponse {
        let body = try jsonBody([
            "name": name,
            "start_date": startDate,
            "end_date": endDate,
            "goal": goal ?? NSNull(),
            "goal_objective_id": goalObjectiveId ?? NSNull(),
            "is_active": isActive,
            "notes": notes ?? NSNull(),
        ])
        return try await APIClient.shared.post("macro-plans", body: body)
    }

    @discardableResult
    static func updateMacroPlan(
        id: Int,
        name: String,
        startDate: String,
        endDate: String,
        goal: String?,
        goalObjectiveId: Int?,
        isActive: Bool,
        notes: String?
    ) async throws -> SuccessResponse {
        let body = try jsonBody([
            "name": name,
            "start_date": startDate,
            "end_date": endDate,
            "goal": goal ?? NSNull(),
            "goal_objective_id": goalObjectiveId ?? NSNull(),
            "is_active": isActive,
            "notes": notes ?? NSNull(),
        ])
        return try await APIClient.shared.patch("macro-plans/\(id)", body: body)
    }

    @discardableResult
    static func setActiveMacroPlan(id: Int) async throws -> SuccessResponse {
        let body = try jsonBody(["is_active": true])
        return try await APIClient.shared.patch("macro-plans/\(id)", body: body)
    }

    @discardableResult
    static func deleteMacroPlan(id: Int) async throws -> SuccessResponse {
        try await APIClient.shared.delete("macro-plans/\(id)")
    }

    @discardableResult
    static func createBlock(
        planId: Int,
        name: String,
        blockType: String,
        startDate: String,
        endDate: String,
        focus: String?
    ) async throws -> SuccessResponse {
        let body = try jsonBody([
            "name": name,
            "block_type": blockType,
            "start_date": startDate,
            "end_date": endDate,
            "focus": focus ?? NSNull(),
        ])
        return try await APIClient.shared.post("macro-plans/\(planId)/blocks", body: body)
    }

    @discardableResult
    static func updateBlock(
        blockId: Int,
        name: String,
        blockType: String,
        startDate: String,
        endDate: String,
        focus: String?
    ) async throws -> SuccessResponse {
        let body = try jsonBody([
            "name": name,
            "block_type": blockType,
            "start_date": startDate,
            "end_date": endDate,
            "focus": focus ?? NSNull(),
        ])
        return try await APIClient.shared.patch("macro-plans/blocks/\(blockId)", body: body)
    }

    @discardableResult
    static func deleteBlock(blockId: Int) async throws -> SuccessResponse {
        try await APIClient.shared.delete("macro-plans/blocks/\(blockId)")
    }

    /// Encodes a dictionary (with `NSNull()` for explicit nulls) to JSON Data.
    private static func jsonBody(_ dict: [String: Any]) throws -> Data {
        try JSONSerialization.data(withJSONObject: dict, options: [])
    }
}
