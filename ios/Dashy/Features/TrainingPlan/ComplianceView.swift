import SwiftUI

/// Compliance summary bar plus a tappable breakdown, mirroring the web workout
/// card's compliance section (score bar + tooltip/accordion details).
struct ComplianceView: View {
    let compliance: ComplianceScore
    @State private var expanded = false

    private var score: Int { Int(compliance.score.rounded()) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation { expanded.toggle() }
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Compliance: \(score)%")
                            .font(.caption.weight(.semibold))
                        Image(systemName: expanded ? "chevron.up" : "chevron.down")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    ProgressView(value: Double(min(max(score, 0), 100)), total: 100)
                        .tint(Self.color(for: score))
                }
            }
            .buttonStyle(.plain)

            if expanded {
                breakdown
            }
        }
    }

    @ViewBuilder
    private var breakdown: some View {
        let b = compliance.breakdown
        VStack(alignment: .leading, spacing: 10) {
            Text("Compliance Breakdown")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            durationSection(b)

            if let intervals = b.intervals {
                intervalsSection(intervals)
            } else {
                if b.hrDetails != nil || b.hrZone != nil {
                    hrSection(b)
                }
                if b.powerDetails != nil || b.powerZone != nil {
                    powerSection(b)
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.tertiarySystemFill))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: Sections

    @ViewBuilder
    private func durationSection(_ b: ComplianceBreakdown) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            row(title: "Duration", score: b.duration)
            if let ratio = b.durationRatio {
                let pct = Int((ratio * 100).rounded())
                if ratio >= 0.8 && ratio <= 1.2 {
                    Text("On target").font(.caption2).foregroundStyle(.green)
                } else if ratio < 0.8 {
                    Text("Too short (\(pct)%)").font(.caption2).foregroundStyle(.blue)
                } else {
                    Text("Too long (\(pct)%)").font(.caption2).foregroundStyle(.red)
                }
            }
        }
    }

    @ViewBuilder
    private func hrSection(_ b: ComplianceBreakdown) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            row(title: "Heart Rate", score: b.hrZone)
            if let d = b.hrDetails {
                Text("Avg \(Int(d.actualAvg)) bpm · Zone \(d.targetZone) (\(Int(d.targetMin))-\(Int(d.targetMax)))")
                    .font(.caption2).foregroundStyle(.secondary)
                directionText(d.direction)
            }
        }
    }

    @ViewBuilder
    private func powerSection(_ b: ComplianceBreakdown) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            row(title: "Power", score: b.powerZone)
            if let d = b.powerDetails {
                Text("Avg \(Int(d.actualAvg)) w · Zone \(d.targetZone) (\(Int(d.targetMin))-\(Int(d.targetMax)))")
                    .font(.caption2).foregroundStyle(.secondary)
                directionText(d.direction)
            }
        }
    }

    @ViewBuilder
    private func intervalsSection(_ intervals: IntervalCompliance) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Intervals")
                    .font(.caption2.weight(.semibold))
                Spacer()
                Text("\(intervals.completed)/\(intervals.expected) (\(Int(intervals.score.rounded()))%)")
                    .font(.caption2)
                    .foregroundStyle(Self.color(for: Int(intervals.score.rounded())))
            }
            Text("\(intervals.expected)x\(Int(intervals.targetDurationSec / 60))min @ Zone \(intervals.targetZone) · \(intervals.source)")
                .font(.caption2).foregroundStyle(.secondary)

            ForEach(intervals.intervals) { interval in
                HStack(spacing: 6) {
                    Image(systemName: intervalIcon(interval.status))
                        .font(.caption2)
                        .foregroundStyle(intervalColor(interval.status))
                    Text("#\(interval.index)")
                        .font(.caption2.weight(.medium))
                    Text(Formatters.clock(seconds: interval.durationSec))
                        .font(.caption2).foregroundStyle(.secondary)
                    Text("\(Int(interval.avgHR)) bpm")
                        .font(.caption2).foregroundStyle(.secondary)
                    if let power = interval.avgPower {
                        Text("\(Int(power)) w")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                }
            }
        }
    }

    // MARK: Helpers

    @ViewBuilder
    private func row(title: String, score: Double?) -> some View {
        HStack {
            Text(title).font(.caption2.weight(.semibold))
            Spacer()
            if let score {
                Text("\(Int(score.rounded()))%")
                    .font(.caption2)
                    .foregroundStyle(Self.color(for: Int(score.rounded())))
            } else {
                Text("N/A").font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func directionText(_ direction: String) -> some View {
        switch direction {
        case "on_target":
            Text("On target").font(.caption2).foregroundStyle(.green)
        case "too_low":
            Text("Too low").font(.caption2).foregroundStyle(.blue)
        case "too_high":
            Text("Too high").font(.caption2).foregroundStyle(.red)
        default:
            EmptyView()
        }
    }

    private func intervalIcon(_ status: String) -> String {
        switch status {
        case "completed": return "checkmark.circle.fill"
        case "wrong_zone": return "exclamationmark.circle.fill"
        case "too_short": return "arrow.down.circle.fill"
        case "too_long": return "arrow.up.circle.fill"
        default: return "xmark.circle.fill"
        }
    }

    private func intervalColor(_ status: String) -> Color {
        switch status {
        case "completed": return .green
        case "too_short", "too_long": return .yellow
        default: return .red
        }
    }

    static func color(for score: Int) -> Color {
        if score >= 80 { return .green }
        if score >= 60 { return .yellow }
        return .red
    }
}
