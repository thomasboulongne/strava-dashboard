import SwiftUI

/// Top-of-screen banner shown while data refreshes in the background, mirroring
/// the web client's RefreshBanner ("Updating…" then "Up to date").
struct RefreshBanner: View {
    @EnvironmentObject private var refresh: RefreshCenter

    var body: some View {
        Group {
            switch refresh.banner {
            case .hidden:
                EmptyView()
            case .updating:
                content {
                    ProgressView().controlSize(.small)
                    Text("Updating\u{2026}")
                }
            case .done:
                content {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Text("Up to date")
                }
            }
        }
        .animation(.easeInOut(duration: 0.2), value: refresh.banner)
    }

    private func content<C: View>(@ViewBuilder _ inner: () -> C) -> some View {
        HStack(spacing: 8) {
            inner()
        }
        .font(.caption.weight(.medium))
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.primary.opacity(0.08)))
        .shadow(color: .black.opacity(0.1), radius: 6, y: 2)
        .padding(.top, 8)
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}
