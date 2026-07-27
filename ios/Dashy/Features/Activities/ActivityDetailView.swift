import SwiftUI
import CoreLocation

struct ActivityDetailView: View {
    let activity: Activity
    @StateObject private var viewModel = ActivityDetailViewModel()

    private var routeCoordinates: [CLLocationCoordinate2D] {
        guard let polyline = activity.map?.summaryPolyline, !polyline.isEmpty else { return [] }
        return Polyline.decode(polyline)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header

                if !routeCoordinates.isEmpty {
                    RouteMapView(coordinates: routeCoordinates)
                }

                metricsGrid

                notesSection

                streamsSection
            }
            .padding()
        }
        .navigationTitle(activity.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadIfNeeded(activity: activity) }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: ActivitySport.symbol(for: activity))
                .font(.title2)
                .foregroundStyle(.dashyOrange)
                .frame(width: 44, height: 44)
                .background(Color.dashyOrange.opacity(0.12))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(activity.name).font(.headline)
                if let date = activity.startDateLocalParsed {
                    Text(Formatters.mediumDate.string(from: date))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
    }

    private var metricsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StatTile(label: "Distance", value: Formatters.distanceKm(meters: activity.distance))
            StatTile(label: "Moving Time", value: Formatters.clock(seconds: activity.movingTime))
            StatTile(label: "Elevation", value: "\(Formatters.elevation(meters: activity.totalElevationGain)) m")
            if let speed = activity.averageSpeed {
                StatTile(label: paceOrSpeedLabel, value: paceOrSpeedValue(speed))
            }
            if let hr = activity.averageHeartrate {
                StatTile(label: "Avg HR", value: "\(Int(hr)) bpm")
            }
            if let watts = activity.averageWatts {
                StatTile(label: "Avg Power", value: "\(Int(watts)) w")
            }
            if let calories = activity.calories, calories > 0 {
                StatTile(label: "Calories", value: "\(Int(calories)) kcal")
            }
            if let suffer = activity.sufferScore {
                StatTile(label: "Suffer Score", value: "\(Int(suffer))")
            }
        }
    }

    private var trimmedPrivateNote: String? {
        guard let note = activity.privateNote?.trimmingCharacters(in: .whitespacesAndNewlines),
              !note.isEmpty else { return nil }
        return note
    }

    @ViewBuilder
    private var notesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Strava's own private note, read-only (the API can't write it back).
            if let privateNote = trimmedPrivateNote {
                SectionHeader(title: "Strava Private Note")
                Card {
                    Text(privateNote)
                        .font(.subheadline)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            // App-only note, editable and stored in our DB.
            SectionHeader(title: "My Note")
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    ZStack(alignment: .topLeading) {
                        if viewModel.note.isEmpty {
                            Text("Add a note for this activity…")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .padding(.top, 8)
                                .padding(.leading, 5)
                        }
                        TextEditor(text: $viewModel.note)
                            .font(.subheadline)
                            .frame(minHeight: 90)
                            .scrollContentBackground(.hidden)
                    }

                    if let noteError = viewModel.noteError {
                        Text(noteError).font(.caption).foregroundStyle(.red)
                    }

                    HStack {
                        if viewModel.noteSaved && !viewModel.hasUnsavedNote {
                            Label("Saved", systemImage: "checkmark.circle.fill")
                                .font(.caption)
                                .foregroundStyle(.green)
                        }
                        Spacer()
                        Button {
                            Task { await viewModel.saveNote(activityId: activity.id) }
                        } label: {
                            if viewModel.isSavingNote {
                                ProgressView()
                            } else {
                                Text("Save")
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.dashyOrange)
                        .disabled(viewModel.isSavingNote || !viewModel.hasUnsavedNote)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var streamsSection: some View {
        if viewModel.isLoading {
            ProgressView().frame(maxWidth: .infinity).padding(.vertical, 24)
        } else if !viewModel.series.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: "Streams")
                ForEach(viewModel.series) { series in
                    StreamChartView(series: series, xAxisLabel: viewModel.xAxisLabel)
                }
            }
        } else if let error = viewModel.errorMessage {
            Text(error).font(.caption).foregroundStyle(.secondary)
        }
    }

    private var isRun: Bool {
        ["Run", "VirtualRun", "TrailRun"].contains(activity.effectiveSportType)
    }

    private var paceOrSpeedLabel: String { isRun ? "Avg Pace" : "Avg Speed" }

    private func paceOrSpeedValue(_ metersPerSecond: Double) -> String {
        isRun
            ? Formatters.pacePerKm(metersPerSecond: metersPerSecond)
            : "\(Formatters.speedKph(metersPerSecond: metersPerSecond)) km/h"
    }
}
