import Foundation

/// Backs the Calendar tab: the athlete's objectives plus the active macro plan
/// and its training blocks. Mirrors the web `useObjectives` hooks + the
/// cache-then-refresh pattern used by `TrainingPlanViewModel`.
@MainActor
final class CalendarViewModel: ObservableObject {
    @Published var objectives: [Objective] = []
    @Published var activePlan: MacroPlan?
    @Published var plans: [MacroPlan] = []
    @Published var isLoading = false
    @Published var isMutating = false
    @Published var errorMessage: String?

    private var hasLoaded = false

    var blocks: [TrainingBlock] {
        (activePlan?.blocks ?? []).sorted {
            ($0.blockOrder, $0.startDate) < ($1.blockOrder, $1.startDate)
        }
    }

    // MARK: - Loading

    func start(_ center: RefreshCenter) async {
        if !hasLoaded {
            if let cached = DiskCache.load(ObjectivesResponse.self, for: CacheKey.objectives) {
                objectives = cached.objectives
            }
            if let cached = DiskCache.load(MacroPlanResponse.self, for: CacheKey.activeMacroPlan) {
                activePlan = cached.plan
            }
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
        isLoading = true
        errorMessage = nil
        do {
            // Objectives + active plan drive the UI; the plan list powers the
            // "switch active plan" affordance.
            async let objectivesData = APIClient.shared.getData("objectives")
            async let activeData = APIClient.shared.getData("macro-plans", query: [
                URLQueryItem(name: "active", value: "1")
            ])
            async let plansResp = DashyAPI.macroPlans()

            let (objData, actData, plansResult) = try await (objectivesData, activeData, plansResp)

            DiskCache.saveData(objData, for: CacheKey.objectives)
            DiskCache.saveData(actData, for: CacheKey.activeMacroPlan)

            objectives = try JSONDecoder.dashy.decode(ObjectivesResponse.self, from: objData).objectives
            activePlan = try JSONDecoder.dashy.decode(MacroPlanResponse.self, from: actData).plan
            plans = plansResult.plans
        } catch let error as APIError {
            if error.statusCode != 401 { errorMessage = error.errorDescription }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Mutations

    /// Runs a mutation then reloads all calendar data.
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

    // Objectives
    func saveObjective(
        id: Int?,
        title: String,
        objectiveType: String,
        startDate: String,
        endDate: String?,
        priority: String?,
        notes: String?
    ) async {
        await mutate {
            if let id {
                try await DashyAPI.updateObjective(
                    id: id, title: title, objectiveType: objectiveType,
                    startDate: startDate, endDate: endDate, priority: priority, notes: notes
                )
            } else {
                try await DashyAPI.createObjective(
                    title: title, objectiveType: objectiveType,
                    startDate: startDate, endDate: endDate, priority: priority, notes: notes
                )
            }
        }
    }

    func deleteObjective(id: Int) async {
        await mutate { try await DashyAPI.deleteObjective(id: id) }
    }

    // Macro plans
    func savePlan(
        id: Int?,
        name: String,
        startDate: String,
        endDate: String,
        goal: String?,
        goalObjectiveId: Int?,
        isActive: Bool,
        notes: String?
    ) async {
        await mutate {
            if let id {
                try await DashyAPI.updateMacroPlan(
                    id: id, name: name, startDate: startDate, endDate: endDate,
                    goal: goal, goalObjectiveId: goalObjectiveId, isActive: isActive, notes: notes
                )
            } else {
                try await DashyAPI.createMacroPlan(
                    name: name, startDate: startDate, endDate: endDate,
                    goal: goal, goalObjectiveId: goalObjectiveId, isActive: isActive, notes: notes
                )
            }
        }
    }

    func setActivePlan(id: Int) async {
        await mutate { try await DashyAPI.setActiveMacroPlan(id: id) }
    }

    func deletePlan(id: Int) async {
        await mutate { try await DashyAPI.deleteMacroPlan(id: id) }
    }

    // Training blocks
    func saveBlock(
        id: Int?,
        planId: Int,
        name: String,
        blockType: String,
        startDate: String,
        endDate: String,
        focus: String?
    ) async {
        await mutate {
            if let id {
                try await DashyAPI.updateBlock(
                    blockId: id, name: name, blockType: blockType,
                    startDate: startDate, endDate: endDate, focus: focus
                )
            } else {
                try await DashyAPI.createBlock(
                    planId: planId, name: name, blockType: blockType,
                    startDate: startDate, endDate: endDate, focus: focus
                )
            }
        }
    }

    func deleteBlock(id: Int) async {
        await mutate { try await DashyAPI.deleteBlock(blockId: id) }
    }
}
