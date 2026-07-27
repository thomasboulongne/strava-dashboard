import SwiftUI

/// A single planned workout, its matched activity (or link menu), and compliance.
struct WorkoutCardView: View {
    let workout: TrainingWorkout
    let linkableActivities: [UnmatchedActivity]
    let onLink: (Int) -> Void
    let onUnlink: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
            plannedMeta

            if let notes = workout.notes, !notes.isEmpty {
                Text("\u{201C}\(notes)\u{201D}")
                    .font(.caption)
                    .italic()
                    .foregroundStyle(.secondary)
            }

            if let matched = workout.matchedActivity {
                matchedActivityPanel(matched.data)
                if let compliance = workout.compliance {
                    ComplianceView(compliance: compliance)
                }
            } else {
                linkSection
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Color.dashyOrange)
                .frame(width: 3)
                .clipShape(RoundedRectangle(cornerRadius: 2))
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            if let time = workout.timeOfDay, !time.isEmpty {
                Text(time.uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.dashyOrange)
            }
            Text(workout.sessionName)
                .font(.subheadline.weight(.semibold))
            Spacer()
            Button(action: onEdit) {
                Image(systemName: "pencil").font(.caption)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            Button(action: onDelete) {
                Image(systemName: "trash").font(.caption)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var plannedMeta: some View {
        let parts = [
            workout.durationTargetMinutes.map { WeekDate.formatTargetDuration($0) },
            workout.intensityTarget.flatMap { $0.isEmpty ? nil : "@ \($0)" },
        ].compactMap { $0 }
        if !parts.isEmpty {
            Text(parts.joined(separator: " "))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func matchedActivityPanel(_ activity: Activity) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: ActivitySport.symbol(for: activity))
                    .font(.caption)
                    .foregroundStyle(.green)
                Text(activity.name)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
                Spacer()
                Button(action: onUnlink) {
                    Image(systemName: "xmark").font(.caption2)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }

            HStack(spacing: 10) {
                Text(Formatters.clock(seconds: activity.movingTime))
                if let hr = activity.averageHeartrate {
                    Text("\(Int(hr)) bpm")
                }
                if activity.deviceWatts == true, let watts = activity.averageWatts {
                    Text("\(Int(watts)) w")
                }
            }
            .font(.caption2)
            .foregroundStyle(.secondary)

            if workout.isManuallyLinked == true {
                Text("Manually linked")
                    .font(.caption2)
                    .foregroundStyle(.green)
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.green.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    @ViewBuilder
    private var linkSection: some View {
        if linkableActivities.isEmpty {
            Text("No activity recorded")
                .font(.caption2)
                .foregroundStyle(.secondary)
        } else {
            Menu {
                ForEach(linkableActivities) { item in
                    Button {
                        onLink(item.id)
                    } label: {
                        Text("\(item.data.name) · \(Formatters.clock(seconds: item.data.movingTime))")
                    }
                }
            } label: {
                Label("Link activity", systemImage: "link")
                    .font(.caption)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4]))
                            .foregroundStyle(.secondary)
                    )
            }
        }
    }
}
