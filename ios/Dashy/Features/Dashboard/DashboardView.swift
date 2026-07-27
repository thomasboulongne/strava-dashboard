import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var refresh: RefreshCenter
    @StateObject private var viewModel = DashboardViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let athlete = viewModel.athlete {
                        Text("Welcome back, \(athlete.firstname)!")
                            .font(.title2.bold())
                    }

                    if viewModel.isLoading && viewModel.stats == nil {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.top, 40)
                    } else if let error = viewModel.errorMessage, viewModel.stats == nil {
                        ContentUnavailableView {
                            Label("Couldn't load dashboard", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text(error)
                        } actions: {
                            Button("Retry") {
                                Task { await viewModel.refresh(refresh, showBanner: true, athleteId: auth.athleteId) }
                            }
                        }
                        .padding(.top, 40)
                    } else if let athlete = viewModel.athlete, let stats = viewModel.stats {
                        StatsOverviewView(athlete: athlete, stats: stats)
                    } else {
                        ContentUnavailableView(
                            "No stats yet",
                            systemImage: "chart.bar",
                            description: Text("Sync your activities to see your stats.")
                        )
                        .padding(.top, 40)
                    }
                }
                .padding()
            }
            .navigationTitle("Dashboard")
            .refreshable { await viewModel.refresh(refresh, showBanner: false, athleteId: auth.athleteId) }
            .task { await viewModel.start(refresh, athleteId: auth.athleteId) }
            .onChange(of: refresh.refreshToken) {
                Task { await viewModel.refresh(refresh, showBanner: true, athleteId: auth.athleteId) }
            }
        }
    }
}
