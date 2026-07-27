import SwiftUI
import WebKit

/// Hosts the Strava OAuth web flow in a `WKWebView` and reports back the
/// `#session=<base64>` payload that the Netlify callback appends when it
/// redirects to `/dashboard` (see netlify/functions/callback.ts). This is the
/// no-backend-change equivalent of the web client's `useSessionCapture`.
struct WebAuthView: UIViewRepresentable {
    let startURL: URL
    let onSession: (SessionToken) -> Void
    let onError: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onSession: onSession, onError: onError)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.load(URLRequest(url: startURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        private let onSession: (SessionToken) -> Void
        private let onError: (String) -> Void
        private var finished = false

        init(onSession: @escaping (SessionToken) -> Void, onError: @escaping (String) -> Void) {
            self.onSession = onSession
            self.onError = onError
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            if let url = navigationAction.request.url, handle(url: url) {
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, didReceiveServerRedirectForProvisionalNavigation navigation: WKNavigation!) {
            if let url = webView.url { _ = handle(url: url) }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            reportFailure(error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            reportFailure(error)
        }

        /// Returns true if the URL carried a session payload (and was consumed).
        private func handle(url: URL) -> Bool {
            guard !finished else { return false }

            // OAuth error: redirected to `/?error=...`.
            if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
               let errorItem = components.queryItems?.first(where: { $0.name == "error" })?.value {
                finished = true
                onError(errorMessage(for: errorItem))
                return true
            }

            // Success: `/dashboard#session=<base64>`.
            guard let fragment = url.fragment, fragment.hasPrefix("session=") else {
                return false
            }
            let payload = String(fragment.dropFirst("session=".count))
            guard let token = SessionToken.fromFragmentPayload(payload) else {
                return false
            }
            finished = true
            onSession(token)
            return true
        }

        private func reportFailure(_ error: Error) {
            let nsError = error as NSError
            // Ignore cancellations triggered by our own `.cancel` decision.
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
            guard !finished else { return }
        }

        private func errorMessage(for code: String) -> String {
            code == "access_denied"
                ? "You denied access to your Strava account."
                : "Authentication failed. Please try again."
        }
    }
}
