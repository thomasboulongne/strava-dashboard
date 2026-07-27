import Foundation

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var athlete: Athlete?
    @Published var stats: AthleteStats?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private var hasLoaded = false

    /// First appearance: show cached data instantly, then refresh in background.
    func start(_ center: RefreshCenter, athleteId: Int?) async {
        if !hasLoaded {
            athlete = DiskCache.load(Athlete.self, for: CacheKey.athlete)
            stats = DiskCache.load(AthleteStats.self, for: CacheKey.stats)
            hasLoaded = true
        }
        await refresh(center, showBanner: true, athleteId: athleteId)
    }

    func refresh(_ center: RefreshCenter, showBanner: Bool, athleteId: Int?) async {
        if showBanner {
            await center.runBanner { await self.fetch(athleteId: athleteId) }
        } else {
            await fetch(athleteId: athleteId)
        }
    }

    private func fetch(athleteId: Int?) async {
        isLoading = true
        errorMessage = nil
        do {
            let athleteData = try await APIClient.shared.getData("athlete")
            let athlete = try JSONDecoder.dashy.decode(Athlete.self, from: athleteData)
            self.athlete = athlete
            DiskCache.saveData(athleteData, for: CacheKey.athlete)

            let id = athleteId ?? athlete.id
            let statsData = try await APIClient.shared.getData(
                "stats", query: [URLQueryItem(name: "athleteId", value: String(id))]
            )
            self.stats = try JSONDecoder.dashy.decode(AthleteStats.self, from: statsData)
            DiskCache.saveData(statsData, for: CacheKey.stats)
        } catch let error as APIError {
            if error.statusCode != 401 { errorMessage = error.errorDescription }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
