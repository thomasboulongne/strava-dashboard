import SwiftUI
import MapKit

/// Draws an activity's route from decoded polyline coordinates using MapKit.
struct RouteMapView: View {
    let coordinates: [CLLocationCoordinate2D]

    var body: some View {
        Map(initialPosition: .region(region)) {
            if coordinates.count > 1 {
                MapPolyline(coordinates: coordinates)
                    .stroke(Color.dashyOrange, lineWidth: 4)
            }
            if let start = coordinates.first {
                Marker("Start", systemImage: "flag", coordinate: start)
                    .tint(.green)
            }
            if let end = coordinates.last {
                Marker("End", systemImage: "flag.checkered", coordinate: end)
                    .tint(.red)
            }
        }
        .mapStyle(.standard(elevation: .realistic))
        .frame(height: 240)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .allowsHitTesting(false)
    }

    private var region: MKCoordinateRegion {
        guard !coordinates.isEmpty else {
            return MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 0, longitude: 0),
                span: MKCoordinateSpan(latitudeDelta: 1, longitudeDelta: 1)
            )
        }

        let lats = coordinates.map(\.latitude)
        let lngs = coordinates.map(\.longitude)
        let minLat = lats.min()!, maxLat = lats.max()!
        let minLng = lngs.min()!, maxLng = lngs.max()!

        let center = CLLocationCoordinate2D(
            latitude: (minLat + maxLat) / 2,
            longitude: (minLng + maxLng) / 2
        )
        let span = MKCoordinateSpan(
            latitudeDelta: max((maxLat - minLat) * 1.3, 0.005),
            longitudeDelta: max((maxLng - minLng) * 1.3, 0.005)
        )
        return MKCoordinateRegion(center: center, span: span)
    }
}
