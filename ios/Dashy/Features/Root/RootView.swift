import SwiftUI

/// Top-level view that decides between the login screen and the authenticated
/// tab interface, mirroring the web router's protected-route behaviour.
struct RootView: View {
    @EnvironmentObject private var auth: AuthManager

    var body: some View {
        Group {
            switch auth.state {
            case .unknown:
                LoadingScreen()
            case .signedOut:
                LoginView()
            case .signedIn:
                MainTabView()
            }
        }
        .animation(.default, value: auth.state)
        .task {
            await auth.restore()
        }
    }
}

private struct LoadingScreen: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 48))
                .foregroundStyle(.dashyOrange)
            ProgressView()
        }
    }
}

struct MainTabView: View {
    @EnvironmentObject private var refresh: RefreshCenter
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Dashboard", systemImage: "square.grid.2x2") }

            ActivityListView()
                .tabItem { Label("Activities", systemImage: "figure.run") }

            AnalyticsView()
                .tabItem { Label("Analytics", systemImage: "chart.xyaxis.line") }

            TrainingPlanView()
                .tabItem { Label("Plan", systemImage: "calendar") }

            CalendarView()
                .tabItem { Label("Calendar", systemImage: "flag.checkered") }

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        // Background-refresh banner pinned to the top.
        .overlay(alignment: .top) {
            RefreshBanner()
        }
        // Re-fetch visible data whenever the app returns to the foreground.
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                refresh.requestRefreshAll()
            }
        }
    }
}
