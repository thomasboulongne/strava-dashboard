import SwiftUI

/// FTP-derived power-zone recap, ported from the web `StatsOverview` power-zones
/// section: a colored Z1-Z7 bar plus a per-zone list with watt ranges and a
/// Sweet Spot row.
struct PowerZonesView: View {
    let ftp: Int

    private struct Zone {
        let zone: String
        let name: String
        let pctMin: Double
        let pctMax: Double // .infinity for the open-ended top zone
        let colorHex: String

        func range(ftp: Int) -> String {
            let f = Double(ftp)
            if pctMin == 0 {
                return "< \(Int((f * pctMax).rounded()))w"
            }
            if pctMax == .infinity {
                return "> \(Int((f * pctMin).rounded()))w"
            }
            return "\(Int((f * pctMin).rounded()))\u{2013}\(Int((f * pctMax).rounded()))w"
        }
    }

    private let zones: [Zone] = [
        Zone(zone: "Z1", name: "Recovery", pctMin: 0, pctMax: 0.55, colorHex: "#94a3b8"),
        Zone(zone: "Z2", name: "Endurance", pctMin: 0.55, pctMax: 0.75, colorHex: "#22c55e"),
        Zone(zone: "Z3", name: "Tempo", pctMin: 0.75, pctMax: 0.90, colorHex: "#84cc16"),
        Zone(zone: "Z4", name: "Threshold", pctMin: 0.90, pctMax: 1.05, colorHex: "#eab308"),
        Zone(zone: "Z5", name: "VO2max", pctMin: 1.05, pctMax: 1.20, colorHex: "#f97316"),
        Zone(zone: "Z6", name: "Anaerobic", pctMin: 1.20, pctMax: 1.50, colorHex: "#ef4444"),
        Zone(zone: "Z7", name: "Neuromuscular", pctMin: 1.50, pctMax: .infinity, colorHex: "#dc2626"),
    ]

    private var sweetSpot: String {
        let f = Double(ftp)
        return "\(Int((f * 0.84).rounded()))\u{2013}\(Int((f * 0.97).rounded()))w"
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Power Zones").font(.headline)
                    Spacer()
                    Text("FTP \(ftp)w").font(.caption).foregroundStyle(.secondary)
                }

                segmentedBar

                VStack(spacing: 8) {
                    ForEach(zones, id: \.zone) { zone in
                        zoneRow(
                            dotColor: Color(hex: zone.colorHex),
                            label: zone.zone,
                            name: zone.name,
                            range: zone.range(ftp: ftp)
                        )
                    }
                    zoneRow(
                        dotColor: Color(hex: "#84cc16"),
                        label: "SS",
                        name: "Sweet Spot",
                        range: sweetSpot
                    )
                }
            }
        }
    }

    private var segmentedBar: some View {
        HStack(spacing: 2) {
            ForEach(zones, id: \.zone) { zone in
                Text(zone.zone)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(Color(hex: zone.colorHex))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func zoneRow(dotColor: Color, label: String, name: String, range: String) -> some View {
        HStack(spacing: 8) {
            Circle()
                .fill(dotColor)
                .frame(width: 10, height: 10)
            Text(label)
                .font(.caption.weight(.semibold))
                .frame(width: 24, alignment: .leading)
            Text(name)
                .font(.caption)
            Spacer()
            Text(range)
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
    }
}
