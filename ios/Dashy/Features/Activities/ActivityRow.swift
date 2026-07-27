import SwiftUI

struct ActivityRow: View {
    let activity: Activity

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: ActivitySport.symbol(for: activity))
                .font(.title3)
                .foregroundStyle(.dashyOrange)
                .frame(width: 36, height: 36)
                .background(Color.dashyOrange.opacity(0.12))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 4) {
                Text(activity.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                Text(dateText)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack(spacing: 10) {
                    metric(Formatters.distanceKm(meters: activity.distance))
                    metric(Formatters.clock(seconds: activity.movingTime))
                    if activity.totalElevationGain > 0 {
                        metric("\(Formatters.elevation(meters: activity.totalElevationGain)) m")
                    }
                }
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }

    private var dateText: String {
        guard let date = activity.startDateLocalParsed else { return "" }
        return Formatters.mediumDate.string(from: date)
    }

    private func metric(_ text: String) -> some View {
        Text(text)
            .font(.caption2)
            .foregroundStyle(.secondary)
    }
}
