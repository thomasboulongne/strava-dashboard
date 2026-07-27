import SwiftUI

@main
struct DashyApp: App {
    @StateObject private var auth = AuthManager()
    @StateObject private var refresh = RefreshCenter()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(refresh)
                .tint(.dashyOrange)
        }
    }
}
