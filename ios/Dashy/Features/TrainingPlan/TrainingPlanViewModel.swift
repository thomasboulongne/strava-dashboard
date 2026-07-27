import Foundation

@MainActor
final class TrainingPlanViewModel: ObservableObject {
    @Published var weekStart: String = WeekDate.weekStart()
    @Published var response: TrainingPlanResponse?
    @Published var isLoading = false
    @Published var isMutating = false
    @Published var errorMessage: String?

    private var hasLoaded = false

    var workouts: [TrainingWorkout] { response?.workouts ?? [] }
    var unmatchedActivities: [UnmatchedActivity] { response?.unmatchedActivities ?? [] }

    // MARK: - Loading

    /// First appearance: render cached week instantly, then refresh.
    func start(_ center: RefreshCenter) async {
        if !hasLoaded {
            response = DiskCache.load(TrainingPlanResponse.self, for: CacheKey.trainingPlan(weekStart))
            hasLoaded = true
        }
        await refresh(center, showBanner: true)
    }

    func refresh(_ center: RefreshCenter, showBanner: Bool) async {
        if showBanner {
            await center.runBanner { await self.fetch() }
        } else {
            await fetch()
        }
    }

    private func fetch() async {
        let week = weekStart
        isLoading = true
        errorMessage = nil
        do {
            let data = try await APIClient.shared.getData("training-plans", query: [
                URLQueryItem(name: "week", value: week)
            ])
            DiskCache.saveData(data, for: CacheKey.trainingPlan(week))
            let decoded = try JSONDecoder.dashy.decode(TrainingPlanResponse.self, from: data)
            // Only apply if the user hasn't navigated to another week meanwhile.
            if week == weekStart { response = decoded }
        } catch let error as APIError {
            if error.statusCode != 401 { errorMessage = error.errorDescription }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Week navigation

    func goToPreviousWeek() { changeWeek(WeekDate.previousWeek(weekStart)) }
    func goToNextWeek() { changeWeek(WeekDate.nextWeek(weekStart)) }
    func goToToday() { changeWeek(WeekDate.weekStart()) }

    private func changeWeek(_ newWeek: String) {
        weekStart = newWeek
        // Show cached week instantly (nil if none), then fetch fresh data.
        response = DiskCache.load(TrainingPlanResponse.self, for: CacheKey.trainingPlan(newWeek))
        Task { await fetch() }
    }

    // MARK: - Per-day helpers

    func workouts(on date: Date) -> [TrainingWorkout] {
        let key = WeekDate.formatYMD(date)
        return workouts
            .filter { $0.workoutDate == key }
            .sorted { ($0.dayOrder ?? 0, $0.id) < ($1.dayOrder ?? 0, $1.id) }
    }

    func unmatchedActivities(on date: Date) -> [UnmatchedActivity] {
        let key = WeekDate.formatYMD(date)
        return unmatchedActivities.filter { item in
            guard let parsed = item.data.startDateLocalParsed else { return false }
            return WeekDate.formatYMD(parsed) == key
        }
    }

    // MARK: - Mutations

    func link(workoutId: Int, activityId: Int) async {
        await mutate { try await DashyAPI.linkActivity(workoutId: workoutId, activityId: activityId) }
    }

    func unlink(workoutId: Int) async {
        await mutate { try await DashyAPI.unlinkActivity(workoutId: workoutId) }
    }

    func createWorkout(
        date: String,
        sessionName: String,
        durationMinutes: Int?,
        intensity: String?,
        notes: String?,
        timeOfDay: String?
    ) async {
        await mutate {
            try await DashyAPI.createWorkout(
                workoutDate: date,
                sessionName: sessionName,
                durationTargetMinutes: durationMinutes,
                intensityTarget: intensity,
                notes: notes,
                timeOfDay: timeOfDay
            )
        }
    }

    func updateWorkout(
        id: Int,
        sessionName: String,
        durationMinutes: Int?,
        intensity: String?,
        notes: String?,
        timeOfDay: String?
    ) async {
        await mutate {
            try await DashyAPI.updateWorkout(
                workoutId: id,
                sessionName: sessionName,
                durationTargetMinutes: durationMinutes,
                intensityTarget: intensity,
                notes: notes,
                timeOfDay: timeOfDay
            )
        }
    }

    func deleteWorkout(id: Int) async {
        await mutate { try await DashyAPI.deleteWorkout(id: id) }
    }

    func clearWeek() async {
        let week = weekStart
        await mutate { try await DashyAPI.deletePlan(week: week) }
    }

    /// Runs a mutation then reloads the current week (refreshing the cache).
    private func mutate(_ action: @escaping () async throws -> some Any) async {
        isMutating = true
        errorMessage = nil
        do {
            _ = try await action()
            await fetch()
        } catch let error as APIError {
            if error.statusCode != 401 { errorMessage = error.errorDescription }
        } catch {
            errorMessage = error.localizedDescription
        }
        isMutating = false
    }
}
