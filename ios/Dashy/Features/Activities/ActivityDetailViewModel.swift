import Foundation

/// A single x/y sample used by the stream charts.
struct StreamPoint: Identifiable {
    let id = UUID()
    let x: Double
    let y: Double
}

/// A named, plottable series extracted from an activity's streams.
struct StreamSeries: Identifiable {
    let id = UUID()
    let title: String
    let unit: String
    let colorHex: String
    let points: [StreamPoint]
}

@MainActor
final class ActivityDetailViewModel: ObservableObject {
    @Published var series: [StreamSeries] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    /// Label describing the chart x-axis (e.g. "Distance (km)").
    @Published var xAxisLabel = "Time (min)"

    private var hasLoaded = false

    func loadIfNeeded(activity: Activity) async {
        guard !hasLoaded else { return }
        await load(activity: activity)
    }

    func load(activity: Activity) async {
        isLoading = true
        errorMessage = nil
        do {
            let response = try await DashyAPI.activityStreams(activityIds: [activity.id])
            if let streams = response.streams[activity.id] {
                build(from: streams)
            }
            hasLoaded = true
        } catch let error as APIError {
            if error.statusCode != 401 { errorMessage = error.errorDescription }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func build(from streams: ActivityStreams) {
        // Choose an x-axis: distance (km) preferred, then time (min), then index.
        let distance = streams.distance?.data
        let time = streams.time?.data

        let xValues: [Double]
        if let distance, !distance.isEmpty {
            xValues = distance.map { $0 / 1000 }
            xAxisLabel = "Distance (km)"
        } else if let time, !time.isEmpty {
            xValues = time.map { $0 / 60 }
            xAxisLabel = "Time (min)"
        } else {
            xValues = []
            xAxisLabel = "Sample"
        }

        var built: [StreamSeries] = []

        func addSeries(_ data: [Double]?, title: String, unit: String, colorHex: String) {
            guard let data, !data.isEmpty else { return }
            let points = makePoints(x: xValues, y: data)
            guard points.count > 1 else { return }
            built.append(StreamSeries(title: title, unit: unit, colorHex: colorHex, points: points))
        }

        addSeries(streams.heartrate?.data, title: "Heart Rate", unit: "bpm", colorHex: "#ef4444")
        addSeries(streams.watts?.data, title: "Power", unit: "w", colorHex: "#8b5cf6")
        addSeries(streams.altitude?.data, title: "Elevation", unit: "m", colorHex: "#f59e0b")
        if let velocity = streams.velocitySmooth?.data {
            addSeries(velocity.map { $0 * 3.6 }, title: "Speed", unit: "km/h", colorHex: "#22c55e")
        }

        series = built
    }

    /// Pairs y-values with x-values, downsampling long streams so charts stay
    /// responsive (Strava streams can hold tens of thousands of samples).
    private func makePoints(x: [Double], y: [Double]) -> [StreamPoint] {
        let count = y.count
        guard count > 0 else { return [] }
        let maxPoints = 400
        let stride = max(1, count / maxPoints)

        var points: [StreamPoint] = []
        var i = 0
        while i < count {
            let xValue = i < x.count ? x[i] : Double(i)
            points.append(StreamPoint(x: xValue, y: y[i]))
            i += stride
        }
        return points
    }
}
