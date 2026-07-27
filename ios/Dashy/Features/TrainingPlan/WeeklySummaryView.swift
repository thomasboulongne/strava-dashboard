import SwiftUI

/// Weekly summary card: total saddle time, the long ride of the week, and any
/// interval sessions, mirroring the web `WeeklySummary`.
struct WeeklySummaryView: View {
    let workouts: [TrainingWorkout]
    let unmatched: [UnmatchedActivity]

    private var allActivities: [Activity] {
        workouts.compactMap { $0.matchedActivity?.data } + unmatched.map { $0.data }
    }

    private var totalSaddleTime: Double {
        allActivities.reduce(0) { $0 + $1.movingTime }
    }

    private var longRide: Activity? {
        allActivities.max { $0.movingTime < $1.movingTime }
    }

    private var intervalWorkouts: [TrainingWorkout] {
        workouts.filter { $0.compliance?.breakdown.intervals != nil }
    }

    var body: some View {
        if allActivities.isEmpty {
            EmptyView()
        } else {
            Card {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Week Summary").font(.headline)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Total Saddle Time")
                            .font(.caption).foregroundStyle(.secondary)
                        Text(Formatters.clock(seconds: totalSaddleTime))
                            .font(.title3.bold())
                    }

                    if let ride = longRide {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Long Ride of the Week")
                                .font(.caption).foregroundStyle(.secondary)
                            Text(ride.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                            HStack(spacing: 10) {
                                Text(Formatters.clock(seconds: ride.movingTime))
                                if let hr = ride.averageHeartrate { Text("\(Int(hr)) bpm") }
                                if ride.deviceWatts == true, let watts = ride.averageWatts {
                                    Text("\(Int(watts)) w")
                                }
                            }
                            .font(.caption).foregroundStyle(.secondary)
                        }
                    }

                    if !intervalWorkouts.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Interval Sessions")
                                .font(.caption).foregroundStyle(.secondary)
                            ForEach(intervalWorkouts) { workout in
                                intervalRow(workout)
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func intervalRow(_ workout: TrainingWorkout) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(workout.sessionName).font(.subheadline.weight(.medium))
            if let activity = workout.matchedActivity?.data {
                Text("\(activity.name) · \(Formatters.clock(seconds: activity.movingTime))")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            if let intervals = workout.compliance?.breakdown.intervals {
                let done = intervals.intervals.filter { $0.status != "missing" }
                ForEach(done) { interval in
                    Text("#\(interval.index) · \(Formatters.clock(seconds: interval.durationSec)) · \(Int(interval.avgHR)) bpm")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
    }
}
