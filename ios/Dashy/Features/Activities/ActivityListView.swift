import SwiftUI

struct ActivityListView: View {
    @EnvironmentObject private var refresh: RefreshCenter
    @StateObject private var viewModel = ActivityListViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.activities.isEmpty {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = viewModel.errorMessage, viewModel.activities.isEmpty {
                    ContentUnavailableView {
                        Label("Couldn't load activities", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Retry") { Task { await viewModel.refresh(refresh, showBanner: true) } }
                    }
                } else if viewModel.activities.isEmpty {
                    ContentUnavailableView(
                        "No activities",
                        systemImage: "figure.run",
                        description: Text("Sync your activities to see them here.")
                    )
                } else {
                    List {
                        ForEach(viewModel.activities) { activity in
                            NavigationLink(value: activity.id) {
                                ActivityRow(activity: activity)
                            }
                            .task { await viewModel.loadMoreIfNeeded(currentItem: activity) }
                        }

                        if viewModel.isLoadingMore {
                            HStack {
                                Spacer()
                                ProgressView()
                                Spacer()
                            }
                            .listRowSeparator(.hidden)
                        }
                    }
                    .listStyle(.plain)
                    .navigationDestination(for: Int.self) { id in
                        if let activity = viewModel.activities.first(where: { $0.id == id }) {
                            ActivityDetailView(activity: activity)
                        }
                    }
                }
            }
            .navigationTitle("Activities")
            .refreshable { await viewModel.refresh(refresh, showBanner: false) }
            .task { await viewModel.start(refresh) }
            .onChange(of: refresh.refreshToken) {
                Task { await viewModel.refresh(refresh, showBanner: true) }
            }
        }
    }
}
