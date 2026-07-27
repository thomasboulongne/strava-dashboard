import SwiftUI

extension Color {
    /// Strava / Dashy brand orange (#FC4C02).
    static let dashyOrange = Color(red: 0xFC / 255, green: 0x4C / 255, blue: 0x02 / 255)

    /// Creates a color from a `#rrggbb` hex string (used by chart palettes that
    /// mirror the web client's color constants).
    init(hex: String) {
        let cleaned = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        let r = Double((value & 0xFF0000) >> 16) / 255
        let g = Double((value & 0x00FF00) >> 8) / 255
        let b = Double(value & 0x0000FF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

extension ShapeStyle where Self == Color {
    /// Allows `.dashyOrange` leading-dot syntax in `ShapeStyle` contexts such as
    /// `foregroundStyle` and `fill`.
    static var dashyOrange: Color { .dashyOrange }
}
