import SwiftUI
import UIKit
import WebKit

@MainActor
final class WebViewState: ObservableObject {
    @Published var currentURL: URL?
    @Published var progress = 0.0
    @Published var canGoBack = false
    @Published var canGoForward = false
    weak var webView: WKWebView?

    func refresh(_ webView: WKWebView) {
        // A callback from a previously selected server must not replace the
        // active browser's address or controls. Publish actual changes only.
        guard self.webView === webView else { return }
        if currentURL != webView.url { currentURL = webView.url }
        if progress != webView.estimatedProgress { progress = webView.estimatedProgress }
        if canGoBack != webView.canGoBack { canGoBack = webView.canGoBack }
        if canGoForward != webView.canGoForward { canGoForward = webView.canGoForward }
    }
}

struct ServerBrowserView: View {
    let initialServer: ServerEndpoint
    @ObservedObject var serverStore: ServerStore
    @ObservedObject var usageStore: CappedUsageStore
    @ObservedObject var storeKit: StoreKitManager
    let onClose: () -> Void
    let onUnlock: () -> Void

    @StateObject private var webState = WebViewState()
    @State private var activeServer: ServerEndpoint
    @State private var externalURL: URL?

    init(
        initialServer: ServerEndpoint,
        serverStore: ServerStore,
        usageStore: CappedUsageStore,
        storeKit: StoreKitManager,
        onClose: @escaping () -> Void,
        onUnlock: @escaping () -> Void
    ) {
        self.initialServer = initialServer
        self.serverStore = serverStore
        self.usageStore = usageStore
        self.storeKit = storeKit
        self.onClose = onClose
        self.onUnlock = onUnlock
        _activeServer = State(initialValue: initialServer)
    }

    var body: some View {
        VStack(spacing: 0) {
            if webState.progress < 1 {
                ProgressView(value: webState.progress)
                    .tint(.accentColor)
                    .accessibilityLabel("Page loading")
            }
            ServerWebView(
                url: activeServer.url,
                dataStoreIdentifier: activeServer.id,
                state: webState,
                onSuccessfulLoad: {
                    usageStore.recordSuccessfulPageLoad(isUnlocked: storeKit.isUnlocked)
                },
                onExternalURL: { externalURL = $0 }
            )
            .id(activeServer.id)
            .ignoresSafeArea(edges: .bottom)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: onClose) {
                    Label("Servers", systemImage: "list.bullet")
                }
            }
            ToolbarItem(placement: .principal) {
                Menu {
                    ForEach(serverStore.servers) { server in
                        Button {
                            activeServer = server
                        } label: {
                            if server.id == activeServer.id {
                                Label(server.name, systemImage: "checkmark")
                            } else {
                                Text(server.name)
                            }
                        }
                    }
                    Divider()
                    Button("Manage servers", action: onClose)
                } label: {
                    HStack(spacing: 5) {
                        Text((webState.currentURL ?? activeServer.url).absoluteOrigin).lineLimit(1)
                        Image(systemName: "chevron.down").font(.caption2)
                    }
                }
                .accessibilityIdentifier("activeServerMenu")
            }
            ToolbarItem(placement: .topBarTrailing) {
                if !storeKit.isUnlocked {
                    Button(action: onUnlock) {
                        Label("Unlock", systemImage: "sparkles")
                    }
                    .labelStyle(.iconOnly)
                    .accessibilityLabel("Lifetime access")
                }
            }
            ToolbarItemGroup(placement: .bottomBar) {
                Button { webState.webView?.goBack() } label: {
                    Image(systemName: "chevron.backward")
                }
                .disabled(!webState.canGoBack)
                Button { webState.webView?.goForward() } label: {
                    Image(systemName: "chevron.forward")
                }
                .disabled(!webState.canGoForward)
                Spacer()
                Button { webState.webView?.reload() } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .accessibilityLabel("Reload page")
            }
        }
        .alert("Open this link outside SeerrNG?", isPresented: Binding(
            get: { externalURL != nil },
            set: { if !$0 { externalURL = nil } }
        )) {
            Button("Cancel", role: .cancel) { externalURL = nil }
            Button("Open link") {
                guard let externalURL else { return }
                UIApplication.shared.open(externalURL)
                self.externalURL = nil
            }
        } message: {
            Text(externalURL?.host ?? "This external website")
        }
        .overlay(alignment: .top) {
            if (webState.currentURL ?? activeServer.url).scheme != "https" {
                Label("HTTP connection is not encrypted", systemImage: "lock.open.fill")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(.orange.opacity(0.16), in: Capsule())
                    .padding(.top, 4)
            }
        }
    }
}

private struct ServerWebView: UIViewRepresentable {
    let url: URL
    let dataStoreIdentifier: UUID
    let state: WebViewState
    let onSuccessfulLoad: () -> Void
    let onExternalURL: (URL) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = WKWebsiteDataStore(forIdentifier: dataStoreIdentifier)
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        if #available(iOS 16.4, *) {
            webView.isInspectable = _isDebugAssertConfiguration()
        }
        // Attaching the weak handle does not publish during SwiftUI rendering.
        // Initial KVO callbacks schedule state publication on the next turn.
        state.webView = webView
        context.coordinator.observe(webView)
        context.coordinator.load(url, in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.load(url, in: webView)
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var parent: ServerWebView
        private var lastLoadedAddress: String?
        private var observations: [NSKeyValueObservation] = []

        init(parent: ServerWebView) {
            self.parent = parent
        }

        func load(_ url: URL, in webView: WKWebView) {
            guard lastLoadedAddress != url.absoluteString else { return }
            lastLoadedAddress = url.absoluteString
            webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy))
        }

        func observe(_ webView: WKWebView) {
            observations = [
                webView.observe(\.url, options: [.initial, .new]) { [weak self] view, _ in
                    Task { @MainActor in self?.parent.state.refresh(view) }
                },
                webView.observe(\.estimatedProgress, options: [.initial, .new]) { [weak self] view, _ in
                    Task { @MainActor in self?.parent.state.refresh(view) }
                },
                webView.observe(\.canGoBack, options: [.initial, .new]) { [weak self] view, _ in
                    Task { @MainActor in self?.parent.state.refresh(view) }
                },
                webView.observe(\.canGoForward, options: [.initial, .new]) { [weak self] view, _ in
                    Task { @MainActor in self?.parent.state.refresh(view) }
                },
            ]
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.state.refresh(webView)
            parent.onSuccessfulLoad()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            parent.state.refresh(webView)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            parent.state.refresh(webView)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let target = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            if navigationAction.targetFrame == nil {
                if target.scheme == "http" || target.scheme == "https" {
                    if target.absoluteOrigin == parent.url.absoluteOrigin {
                        webView.load(URLRequest(url: target))
                    } else {
                        parent.onExternalURL(target)
                    }
                }
                decisionHandler(.cancel)
                return
            }
            if navigationAction.navigationType == .linkActivated,
               target.absoluteOrigin != parent.url.absoluteOrigin,
               target.scheme == "http" || target.scheme == "https" {
                parent.onExternalURL(target)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard let target = navigationAction.request.url else { return nil }
            if target.absoluteOrigin == parent.url.absoluteOrigin {
                webView.load(URLRequest(url: target))
            } else if target.scheme == "http" || target.scheme == "https" {
                parent.onExternalURL(target)
            }
            return nil
        }
    }
}

private extension URL {
    var absoluteOrigin: String {
        guard let scheme, let host, user == nil, password == nil,
              scheme == "https" || scheme == "http" else { return "about:blank" }
        return "\(scheme.lowercased())://\(host.lowercased()):\(port ?? (scheme == "https" ? 443 : 80))"
    }
}
