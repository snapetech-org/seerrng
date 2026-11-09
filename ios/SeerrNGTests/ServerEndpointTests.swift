import Combine
import WebKit
import XCTest
@testable import SeerrNG

final class ServerEndpointTests: XCTestCase {
    func testAddsHTTPSAndNormalizesAddress() throws {
        let server = try ServerEndpoint.create(name: " Home ", address: "Media.Example.com:443/library/")

        XCTAssertEqual(server.name, "Home")
        XCTAssertEqual(server.urlString, "https://media.example.com/library")
        XCTAssertTrue(server.usesHTTPS)
    }

    func testKeepsHTTPPortAndMarksConnectionInsecure() throws {
        let server = try ServerEndpoint.create(name: "LAN", address: "http://192.168.1.20:8096/")

        XCTAssertEqual(server.urlString, "http://192.168.1.20:8096")
        XCTAssertFalse(server.usesHTTPS)
    }

    func testRejectsCredentialsAndQueryStrings() {
        XCTAssertThrowsError(try ServerEndpoint.create(name: "Home", address: "https://user:pass@example.com")) {
            XCTAssertEqual($0 as? ServerEndpointError, .credentialsInAddress)
        }
        XCTAssertThrowsError(try ServerEndpoint.create(name: "Home", address: "https://example.com/?token=secret")) {
            XCTAssertEqual($0 as? ServerEndpointError, .queryOrFragment)
        }
    }

    func testRejectsUnsupportedSchemesAndInvalidPorts() {
        XCTAssertThrowsError(try ServerEndpoint.create(name: "Home", address: "ftp://example.com")) {
            XCTAssertEqual($0 as? ServerEndpointError, .unsupportedScheme)
        }
        XCTAssertThrowsError(try ServerEndpoint.create(name: "Home", address: "https://example.com:65536")) {
            XCTAssertEqual($0 as? ServerEndpointError, .invalidPort)
        }
    }
}

final class WebViewStateTests: XCTestCase {
    @MainActor
    func testUnchangedBrowserStateDoesNotPublishAgain() {
        let view = WKWebView()
        let state = WebViewState()
        state.webView = view
        state.refresh(view)
        var updates = 0
        let observation = state.objectWillChange.sink { updates += 1 }
        defer { observation.cancel() }
        state.refresh(view)
        state.refresh(view)
        XCTAssertEqual(updates, 0)
        state.progress = 0.5
        updates = 0
        state.refresh(view)
        XCTAssertEqual(updates, 1)
        state.refresh(view)
        XCTAssertEqual(updates, 1)
    }

    @MainActor
    func testLateCallbacksCannotReplaceTheActiveBrowser() {
        let previous = WKWebView()
        let active = WKWebView()
        let state = WebViewState()
        state.webView = active
        state.progress = 0.5
        var updates = 0
        let observation = state.objectWillChange.sink { updates += 1 }
        defer { observation.cancel() }
        state.refresh(previous)
        XCTAssertTrue(state.webView === active)
        XCTAssertEqual(state.progress, 0.5)
        XCTAssertEqual(updates, 0)
        state.refresh(active)
        XCTAssertEqual(state.progress, active.estimatedProgress)
        XCTAssertEqual(updates, 1)
    }
}
