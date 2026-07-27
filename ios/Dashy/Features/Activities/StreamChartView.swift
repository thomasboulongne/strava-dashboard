import SwiftUI
import Charts

/// Renders one activity stream (HR, power, elevation, speed) as a line chart.
struct StreamChartView: View {
    let series: StreamSeries
    let xAxisLabel: String

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                Text("\(series.title) (\(series.unit))")
                    .font(.subheadline.weight(.semibold))

                Chart(series.points) { point in
                    LineMark(
                        x: .value("x", point.x),
                        y: .value(series.title, point.y)
                    )
                    .interpolationMethod(.monotone)
                    .foregroundStyle(Color(hex: series.colorHex))
                }
                .chartXAxisLabel(xAxisLabel)
                .frame(height: 180)
            }
        }
    }
}
