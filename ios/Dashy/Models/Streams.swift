import Foundation

/// Mirrors `StreamData` in src/lib/strava-types.ts.
struct StreamData: Decodable {
    let data: [Double]
    let seriesType: String?
    let originalSize: Int?
    let resolution: String?
}

/// Mirrors `ActivityStreams` in src/lib/strava-types.ts.
struct ActivityStreams: Decodable {
    let time: StreamData?
    let heartrate: StreamData?
    let watts: StreamData?
    let cadence: StreamData?
    let distance: StreamData?
    let altitude: StreamData?
    let velocitySmooth: StreamData?
}

/// Mirrors `ActivityStreamsResponse` (keyed by activity id).
struct ActivityStreamsResponse: Decodable {
    let streams: [Int: ActivityStreams]
    let count: Int
}
