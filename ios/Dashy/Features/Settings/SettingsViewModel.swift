import Foundation

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var status: SyncStatusResponse?
    @Published var isLoadingStatus = false
    @Published var isSyncing = false
    @Published var isRefreshingDetails = false
    @Published var message: String?

    func loadStatus() async {
        isLoadingStatus = true
        do {
            status = try await DashyAPI.syncStatus()
        } catch let error as APIError {
            if error.statusCode != 401 { message = error.errorDescription }
        } catch {
            message = error.localizedDescription
        }
        isLoadingStatus = false
    }

    func sync() async {
        isSyncing = true
        message = nil
        do {
            let result = try await DashyAPI.triggerSync()
            switch result.status {
            case "completed":
                message = "Sync complete. \(result.totalSynced ?? 0) new activities."
            case "in_progress":
                message = "Sync in progress\u{2026}"
            default:
                message = result.reason ?? "Sync \(result.status)."
            }
            await loadStatus()
        } catch let error as APIError {
            if error.statusCode != 401 { message = error.errorDescription }
        } catch {
            message = error.localizedDescription
        }
        isSyncing = false
    }

    func refreshDetails() async {
        isRefreshingDetails = true
        message = nil
        do {
            let result = try await DashyAPI.triggerActivityRefresh()
            let refreshed = result.refreshed ?? 0
            switch result.status {
            case "completed":
                message = "Refreshed details for \(refreshed) recent activities."
            case "paused":
                message = "Refreshed \(refreshed) activities (paused for rate limit)."
            default:
                message = result.error ?? "Refresh \(result.status)."
            }
        } catch let error as APIError {
            if error.statusCode != 401 { message = error.errorDescription }
        } catch {
            message = error.localizedDescription
        }
        isRefreshingDetails = false
    }

    var latestActivityText: String? {
        guard let raw = status?.latestActivityDate,
              let date = Formatters.parseISODate(raw) else { return nil }
        return Formatters.mediumDate.string(from: date)
    }
}
