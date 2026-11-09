import Combine
import Foundation
import WebKit

@MainActor
final class ServerStore: ObservableObject {
    @Published private(set) var servers: [ServerEndpoint]

    private let defaults: UserDefaults
    private let storageKey = "savedServers.v1"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if ProcessInfo.processInfo.arguments.contains("-reset-server-data") {
            defaults.removeObject(forKey: storageKey)
        }
        if let data = defaults.data(forKey: storageKey),
           let saved = try? JSONDecoder().decode([ServerEndpoint].self, from: data) {
            servers = saved
        } else {
            servers = []
        }
    }

    func save(_ server: ServerEndpoint) {
        if let index = servers.firstIndex(where: { $0.id == server.id }) {
            servers[index] = server
        } else {
            servers.append(server)
        }
        persist()
    }

    @discardableResult
    func remove(id: UUID) -> ServerEndpoint? {
        guard let index = servers.firstIndex(where: { $0.id == id }) else { return nil }
        let removed = servers.remove(at: index)
        persist()
        // Static store removal can run before any browser has initialized WebKit.
        // Initialize its main run loop on the main actor before background cleanup.
        _ = WKWebsiteDataStore.default()
        Task {
            // Let SwiftUI release any web view using this server before deleting its store.
            try? await Task.sleep(for: .milliseconds(300))
            try? await WKWebsiteDataStore.remove(forIdentifier: id)
        }
        return removed
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(servers) else { return }
        defaults.set(data, forKey: storageKey)
    }
}
