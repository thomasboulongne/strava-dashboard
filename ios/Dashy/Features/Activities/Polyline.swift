import Foundation
import CoreLocation

/// Decoder for Google's Encoded Polyline Algorithm, used by Strava's
/// `map.summary_polyline`. Ported to draw routes natively in MapKit.
enum Polyline {
    static func decode(_ encoded: String) -> [CLLocationCoordinate2D] {
        var coordinates: [CLLocationCoordinate2D] = []
        let scalars = Array(encoded.unicodeScalars)
        var index = 0
        var lat = 0
        var lng = 0

        while index < scalars.count {
            guard let latDelta = nextValue(scalars, &index) else { break }
            lat += latDelta
            guard let lngDelta = nextValue(scalars, &index) else { break }
            lng += lngDelta

            coordinates.append(
                CLLocationCoordinate2D(
                    latitude: Double(lat) / 1e5,
                    longitude: Double(lng) / 1e5
                )
            )
        }

        return coordinates
    }

    private static func nextValue(_ scalars: [Unicode.Scalar], _ index: inout Int) -> Int? {
        var result = 0
        var shift = 0
        var byte = 0

        repeat {
            guard index < scalars.count else { return nil }
            byte = Int(scalars[index].value) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
        } while byte >= 0x20

        // Decode zigzag back to a signed integer.
        return (result & 1) != 0 ? ~(result >> 1) : (result >> 1)
    }
}
