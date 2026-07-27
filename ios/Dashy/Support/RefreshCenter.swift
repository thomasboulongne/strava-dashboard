import SwiftUI

/// Coordinates background refreshes and drives the "Updating…" banner, the
/// native equivalent of the web client's global `useIsFetching` + RefreshBanner.
@MainActor
final class RefreshCenter: ObservableObject {
    enum Banner: Equatable { case hidden, updating, done }

    @Published private(set) var banner: Banner = .hidden
    /// Bumped when the app becomes active so visible tabs re-fetch.
    @Published private(set) var refreshToken = 0

    private var activeCount = 0
    private var hideTask: Task<Void, Never>?

    private func begin() {
        activeCount += 1
        hideTask?.cancel()
        banner = .updating
    }

    private func end() {
        activeCount = max(0, activeCount - 1)
        guard activeCount == 0 else { return }
        banner = .done
        hideTask?.cancel()
        hideTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            guard let self, !Task.isCancelled else { return }
            if self.activeCount == 0 { self.banner = .hidden }
        }
    }

    /// Wraps a refresh so the banner reflects in-flight work.
    func runBanner(_ operation: () async -> Void) async {
        begin()
        await operation()
        end()
    }

    /// Signals all mounted tabs to refresh (called when the app foregrounds).
    func requestRefreshAll() {
        refreshToken += 1
    }
}
