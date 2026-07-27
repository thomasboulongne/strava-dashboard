import Foundation

@MainActor
final class AnalyticsViewModel: ObservableObject {
    @Published var weeklyVolume: [AnalyticsMath.WeeklyVolume] = []
    @Published var dailyActivity: [AnalyticsMath.DailyActivity] = []
    @Published var trainingLoad: [AnalyticsMath.LoadPoint] = []
    @Published var hrZones: [AnalyticsMath.ZoneSlice] = []

    @Published var isLoading = false
    @Published var errorMessage: String?

    private var hasLoaded = false

    /// First appearance: render from cache instantly, then refresh.
    func start(_ center: RefreshCenter) async {
        if !hasLoaded {
            loadFromCache()
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

    private func loadFromCache() {
        if let cached = DiskCache.load(ActivitiesResponse.self, for: CacheKey.analyticsActivities) {
            computeActivityCharts(cached.activities)
        }
        if let zones = DiskCache.load(AthleteZonesResponse.self, for: CacheKey.analyticsZones),
           let streams = DiskCache.load(ActivityStreamsResponse.self, for: CacheKey.analyticsStreams) {
            computeHRZones(zones: zones, streams: streams)
        }
    }

    private func fetch() async {
        isLoading = true
        errorMessage = nil
        do {
            let activitiesData = try await APIClient.shared.getData("activities", query: [
                URLQueryItem(name: "limit", value: "200"),
                URLQueryItem(name: "offset", value: "0"),
            ])
            let response = try JSONDecoder.dashy.decode(ActivitiesResponse.self, from: activitiesData)
            DiskCache.saveData(activitiesData, for: CacheKey.analyticsActivities)
            computeActivityCharts(response.activities)

            await fetchHRZones(from: response.activities)
        } catch let error as APIError {
            if error.statusCode != 401 { errorMessage = error.errorDescription }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func fetchHRZones(from activities: [Activity]) async {
        do {
            let zonesData = try await APIClient.shared.getData("zones")
            let zones = try JSONDecoder.dashy.decode(AthleteZonesResponse.self, from: zonesData)
            guard let hrRanges = zones.zones.heartRate?.zones, !hrRanges.isEmpty else {
                hrZones = []
                return
            }
            DiskCache.saveData(zonesData, for: CacheKey.analyticsZones)

            let ids = activities.filter { $0.hasHeartrate == true }.prefix(40).map(\.id)
            guard !ids.isEmpty else { hrZones = []; return }

            let streamsData = try await APIClient.shared.getData("activity-streams", query: [
                URLQueryItem(name: "activityIds", value: ids.map(String.init).joined(separator: ","))
            ])
            let streams = try JSONDecoder.dashy.decode(ActivityStreamsResponse.self, from: streamsData)
            DiskCache.saveData(streamsData, for: CacheKey.analyticsStreams)
            computeHRZones(zones: zones, streams: streams)
        } catch {
            // HR zones are best-effort; leave whatever was rendered from cache.
        }
    }

    private func computeActivityCharts(_ activities: [Activity]) {
        weeklyVolume = AnalyticsMath.weeklyVolume(activities, weeks: 26)
        dailyActivity = AnalyticsMath.dailyMinutes(activities, days: 119)
        trainingLoad = AnalyticsMath.trainingLoad(activities, days: 90)
    }

    private func computeHRZones(zones: AthleteZonesResponse, streams: ActivityStreamsResponse) {
        guard let hrRanges = zones.zones.heartRate?.zones, !hrRanges.isEmpty else {
            hrZones = []
            return
        }
        hrZones = AnalyticsMath.hrZoneDistribution(streams: Array(streams.streams.values), zones: hrRanges)
    }
}
