import Foundation

@MainActor
final class ActivityListViewModel: ObservableObject {
    @Published var activities: [Activity] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var errorMessage: String?

    private let pageSize = 30
    private var offset = 0
    private var hasMore = true
    private var hasLoaded = false

    /// First appearance: show cached first page instantly, then refresh.
    func start(_ center: RefreshCenter) async {
        if !hasLoaded {
            if let cached = DiskCache.load(ActivitiesResponse.self, for: CacheKey.activitiesPage0) {
                activities = cached.activities
                offset = cached.activities.count
                hasMore = cached.hasMore
            }
            hasLoaded = true
        }
        await refresh(center, showBanner: true)
    }

    func refresh(_ center: RefreshCenter, showBanner: Bool) async {
        if showBanner {
            await center.runBanner { await self.fetchFirstPage() }
        } else {
            await fetchFirstPage()
        }
    }

    private func fetchFirstPage() async {
        isLoading = true
        errorMessage = nil
        do {
            let data = try await APIClient.shared.getData("activities", query: [
                URLQueryItem(name: "limit", value: String(pageSize)),
                URLQueryItem(name: "offset", value: "0"),
            ])
            let response = try JSONDecoder.dashy.decode(ActivitiesResponse.self, from: data)
            activities = response.activities
            offset = response.activities.count
            hasMore = response.hasMore
            DiskCache.saveData(data, for: CacheKey.activitiesPage0)
        } catch let error as APIError {
            if error.statusCode != 401 { errorMessage = error.errorDescription }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func loadMoreIfNeeded(currentItem: Activity) async {
        guard hasMore, !isLoadingMore, !isLoading else { return }
        guard let index = activities.firstIndex(where: { $0.id == currentItem.id }),
              index >= activities.count - 5 else { return }

        isLoadingMore = true
        do {
            let response = try await DashyAPI.activities(limit: pageSize, offset: offset)
            let existing = Set(activities.map(\.id))
            let newOnes = response.activities.filter { !existing.contains($0.id) }
            activities.append(contentsOf: newOnes)
            offset += response.activities.count
            hasMore = response.hasMore
        } catch let error as APIError {
            if error.statusCode != 401 { errorMessage = error.errorDescription }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoadingMore = false
    }
}
