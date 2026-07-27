import SwiftUI
import Charts

struct AnalyticsView: View {
    @EnvironmentObject private var refresh: RefreshCenter
    @StateObject private var viewModel = AnalyticsViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if viewModel.isLoading && viewModel.weeklyVolume.isEmpty {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    } else if let error = viewModel.errorMessage, viewModel.weeklyVolume.isEmpty {
                        ContentUnavailableView {
                            Label("Couldn't load analytics", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text(error)
                        } actions: {
                            Button("Retry") { Task { await viewModel.refresh(refresh, showBanner: true) } }
                        }
                        .padding(.top, 40)
                    } else {
                        weeklyVolumeCard
                        trainingLoadCard
                        consistencyCard
                        if !viewModel.hrZones.isEmpty {
                            hrZonesCard
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Analytics")
            .refreshable { await viewModel.refresh(refresh, showBanner: false) }
            .task { await viewModel.start(refresh) }
            .onChange(of: refresh.refreshToken) {
                Task { await viewModel.refresh(refresh, showBanner: true) }
            }
        }
    }

    // MARK: Weekly volume

    private var weeklyVolumeCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                Text("Weekly Volume").font(.headline)
                Text("Hours per week, last 26 weeks").font(.caption).foregroundStyle(.secondary)
                Chart(viewModel.weeklyVolume) { week in
                    BarMark(
                        x: .value("Week", week.weekStart, unit: .weekOfYear),
                        y: .value("Hours", week.hours)
                    )
                    .foregroundStyle(Color.dashyOrange)
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: .month)) { value in
                        AxisGridLine()
                        AxisValueLabel(format: .dateTime.month(.abbreviated))
                    }
                }
                .frame(height: 200)
            }
        }
    }

    // MARK: Training load

    private var trainingLoadCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                Text("Training Load").font(.headline)
                Text("Acute (7d) vs chronic (28d), last 90 days")
                    .font(.caption).foregroundStyle(.secondary)
                Chart {
                    ForEach(viewModel.trainingLoad) { point in
                        LineMark(
                            x: .value("Date", point.date),
                            y: .value("Load", point.chronic),
                            series: .value("Series", "Chronic")
                        )
                        .foregroundStyle(.blue)
                    }
                    ForEach(viewModel.trainingLoad) { point in
                        LineMark(
                            x: .value("Date", point.date),
                            y: .value("Load", point.acute),
                            series: .value("Series", "Acute")
                        )
                        .foregroundStyle(Color.dashyOrange)
                    }
                }
                .chartForegroundStyleScale([
                    "Acute": Color.dashyOrange,
                    "Chronic": Color.blue,
                ])
                .chartXAxis {
                    AxisMarks(values: .stride(by: .month)) { _ in
                        AxisGridLine()
                        AxisValueLabel(format: .dateTime.month(.abbreviated))
                    }
                }
                .frame(height: 200)
            }
        }
    }

    // MARK: Consistency heatmap

    private var consistencyCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("Consistency").font(.headline)
                Text("Daily activity, last 17 weeks").font(.caption).foregroundStyle(.secondary)
                HeatmapGrid(days: viewModel.dailyActivity)
            }
        }
    }

    // MARK: HR zones

    private var hrZonesCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                Text("HR Zone Distribution").font(.headline)
                Text("Share of time in each zone (recent activities)")
                    .font(.caption).foregroundStyle(.secondary)
                Chart(viewModel.hrZones) { slice in
                    BarMark(
                        x: .value("Zone", slice.label),
                        y: .value("Percent", slice.percentage)
                    )
                    .foregroundStyle(Color(hex: slice.colorHex))
                    .annotation(position: .top) {
                        Text("\(Int(slice.percentage))%")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(height: 200)
            }
        }
    }
}

/// GitHub-style consistency grid (columns = weeks, rows = weekdays).
private struct HeatmapGrid: View {
    let days: [AnalyticsMath.DailyActivity]

    private let cell: CGFloat = 13
    private let spacing: CGFloat = 3

    private var columns: [[AnalyticsMath.DailyActivity?]] {
        guard !days.isEmpty else { return [] }
        let cal = AnalyticsMath.calendar
        var result: [[AnalyticsMath.DailyActivity?]] = []
        var current = [AnalyticsMath.DailyActivity?](repeating: nil, count: 7)

        for day in days {
            // weekday with Monday = 0 ... Sunday = 6
            let weekday = (cal.component(.weekday, from: day.date) + 5) % 7
            if weekday == 0 && current.contains(where: { $0 != nil }) {
                result.append(current)
                current = [AnalyticsMath.DailyActivity?](repeating: nil, count: 7)
            }
            current[weekday] = day
        }
        result.append(current)
        return result
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: spacing) {
                ForEach(Array(columns.enumerated()), id: \.offset) { _, week in
                    VStack(spacing: spacing) {
                        ForEach(0..<7, id: \.self) { row in
                            RoundedRectangle(cornerRadius: 3)
                                .fill(color(for: week[row]))
                                .frame(width: cell, height: cell)
                        }
                    }
                }
            }
        }
    }

    private func color(for day: AnalyticsMath.DailyActivity?) -> Color {
        guard let day else { return Color.gray.opacity(0.12) }
        switch day.intensityBin {
        case 1: return Color.dashyOrange.opacity(0.3)
        case 2: return Color.dashyOrange.opacity(0.5)
        case 3: return Color.dashyOrange.opacity(0.75)
        case 4: return Color.dashyOrange
        default: return Color.gray.opacity(0.12)
        }
    }
}
