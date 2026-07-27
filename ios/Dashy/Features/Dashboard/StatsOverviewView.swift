import SwiftUI

/// Port of the web `StatsOverview` component: profile card, all-time highlight
/// grid, and a per-period (4W / YTD / All) activity breakdown by sport.
struct StatsOverviewView: View {
    let athlete: Athlete
    let stats: AthleteStats

    @State private var period: AthleteStats.Period = .recent

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        VStack(spacing: 16) {
            profileCard

            if let ftp = athlete.ftp {
                PowerZonesView(ftp: ftp)
            }

            LazyVGrid(columns: columns, spacing: 12) {
                StatTile(label: "Total Activities", value: Formatters.count(stats.totalActivities))
                StatTile(label: "Total Distance", value: "\(Formatters.distance(meters: stats.totalDistance)) km")
                StatTile(label: "Total Time", value: Formatters.duration(seconds: stats.totalTime))
                StatTile(label: "Total Elevation", value: "\(Formatters.elevation(meters: stats.totalElevation)) m")
            }

            breakdown
        }
    }

    private var profileCard: some View {
        Card {
            HStack(spacing: 14) {
                AsyncImage(url: athlete.profileURL) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Image(systemName: "person.circle.fill")
                        .resizable()
                        .foregroundStyle(.secondary)
                }
                .frame(width: 56, height: 56)
                .clipShape(Circle())

                VStack(alignment: .leading, spacing: 4) {
                    Text(athlete.fullName).font(.headline)
                    if let location = athlete.location {
                        Text(location).font(.caption).foregroundStyle(.secondary)
                    }
                    if let memberSince = athlete.memberSince {
                        Text("Member since \(memberSince)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                if let ftp = athlete.ftp {
                    VStack(spacing: 2) {
                        Text("FTP").font(.caption2).foregroundStyle(.secondary)
                        Text("\(ftp)w").font(.subheadline.bold())
                    }
                }
            }
        }
    }

    private var breakdown: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Activity Breakdown").font(.headline)
                    Spacer()
                    Picker("Period", selection: $period) {
                        ForEach(AthleteStats.Period.allCases) { p in
                            Text(p.shortLabel).tag(p)
                        }
                    }
                    .pickerStyle(.segmented)
                    .fixedSize()
                }

                Text(period.longLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                let ride = stats.ride(period)
                let run = stats.run(period)
                let swim = stats.swim(period)

                if ride.count == 0 && run.count == 0 && swim.count == 0 {
                    Text("No activities for this period")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 12)
                } else {
                    breakdownRow(title: "Rides", symbol: "figure.outdoor.cycle", totals: ride)
                    breakdownRow(title: "Runs", symbol: "figure.run", totals: run)
                    breakdownRow(title: "Swims", symbol: "figure.pool.swim", totals: swim)
                }
            }
        }
    }

    @ViewBuilder
    private func breakdownRow(title: String, symbol: String, totals: ActivityTotal) -> some View {
        if totals.count > 0 {
            VStack(alignment: .leading, spacing: 8) {
                Label(title, systemImage: symbol)
                    .font(.subheadline.weight(.semibold))
                HStack {
                    miniStat(Formatters.count(totals.count), "Activities")
                    Spacer()
                    miniStat("\(Formatters.distance(meters: totals.distance)) km", "Distance")
                    Spacer()
                    miniStat(Formatters.duration(seconds: totals.movingTime), "Time")
                    Spacer()
                    miniStat("\(Formatters.elevation(meters: totals.elevationGain)) m", "Elev")
                }
            }
            .padding(.vertical, 4)
        }
    }

    private func miniStat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.subheadline.weight(.semibold))
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }
}
