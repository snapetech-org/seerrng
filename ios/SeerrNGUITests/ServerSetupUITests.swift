import XCTest
import Network

final class ServerSetupUITests: XCTestCase {
    func testActualOriginRemainsVisibleAcrossSignInRedirects() throws {
        // Changed only in the historical comparison checkout, never production.
        let historicalBaseline = false
        let first = try OriginFixtureServer(port: 18771, target: 18772)
        let second = try OriginFixtureServer(port: 18772, target: 18772)
        defer { first.stop(); second.stop() }
        let app = XCUIApplication()
        app.launchArguments.append("-reset-server-data")
        app.launch()
        XCTAssertTrue(app.buttons["addServerButton"].waitForExistence(timeout: 10))
        app.buttons["addServerButton"].tap()
        app.textFields["serverNameField"].tap()
        app.textFields["serverNameField"].typeText("Saved server")
        app.textFields["serverURLField"].tap()
        app.textFields["serverURLField"].typeText("http://127.0.0.1:18771")
        app.buttons["saveServerButton"].tap()
        let warning = app.alerts["Use an unencrypted HTTP connection?"]
        XCTAssertTrue(warning.waitForExistence(timeout: 5))
        warning.buttons["Use HTTP"].tap()
        waitForSavedServer("Saved server", in: app)
        app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'connectServer_'" )).firstMatch.tap()
        XCTAssertTrue(app.webViews.staticTexts["Origin fixture"].waitForExistence(timeout: 20))
        let menu = app.buttons["activeServerMenu"]
        XCTAssertTrue(menu.label.contains(historicalBaseline ? "Saved server" : "http://127.0.0.1:18771"))
        captureOrigin("origin-initial", app: app)
        app.webViews.links["Continue sign-in"].tap()
        XCTAssertTrue(app.webViews.staticTexts["Redirected origin fixture"].waitForExistence(timeout: 20))
        XCTAssertTrue(menu.label.contains(historicalBaseline ? "Saved server" : "http://127.0.0.1:18772"))
        XCTAssertTrue(app.staticTexts["HTTP connection is not encrypted"].exists)
        captureOrigin("origin-redirect", app: app)
    }

    private func captureOrigin(_ name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testFirstLaunchCanAddAndSaveAnHTTPSSeerrNGServer() {
        let app = XCUIApplication()
        app.launchArguments.append("-reset-server-data")
        app.launch()

        let addButton = app.buttons["addServerButton"]
        XCTAssertTrue(addButton.waitForExistence(timeout: 5))
        addButton.tap()

        let nameField = app.textFields["serverNameField"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 5))
        nameField.tap()
        nameField.typeText("Home server")

        let addressField = app.textFields["serverURLField"]
        addressField.tap()
        addressField.typeText("media.example.test/library/")
        app.buttons["saveServerButton"].tap()

        XCTAssertTrue(app.staticTexts["Home server"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["https://media.example.test/library"].exists)
    }

    func testHTTPRequiresAnExplicitWarningConfirmation() {
        let app = XCUIApplication()
        app.launchArguments.append("-reset-server-data")
        app.launch()
        app.buttons["addServerButton"].tap()

        let nameField = app.textFields["serverNameField"]
        nameField.tap()
        nameField.typeText("Local server")
        let addressField = app.textFields["serverURLField"]
        addressField.tap()
        addressField.typeText("http://192.168.1.5:5055")
        app.buttons["saveServerButton"].tap()

        let warning = app.alerts["Use an unencrypted HTTP connection?"]
        XCTAssertTrue(warning.waitForExistence(timeout: 3))
        warning.buttons["Use HTTP"].tap()

        XCTAssertTrue(app.staticTexts["Local server"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["HTTP is not encrypted"].exists)
    }

    func testCanKeepMultipleServersAndEditOrRemoveOne() {
        let app = XCUIApplication()
        app.launchArguments.append("-reset-server-data")
        app.launch()
        app.buttons["addServerButton"].tap()

        app.textFields["serverNameField"].tap()
        app.textFields["serverNameField"].typeText("Home")
        app.textFields["serverURLField"].tap()
        app.textFields["serverURLField"].typeText("home.example.test")
        app.buttons["saveServerButton"].tap()
        waitForSavedServer("Home", in: app)

        let addAnotherServerButton = app.buttons["addServerToolbarButton"]
        XCTAssertTrue(addAnotherServerButton.waitForExistence(timeout: 10))
        XCTAssertTrue(
            addAnotherServerButton.isHittable,
            "The add-server toolbar button should be available after saving a server."
        )
        addAnotherServerButton.tap()
        let nameField = app.textFields["serverNameField"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 20))
        nameField.tap()
        nameField.typeText("Office")
        let addressField = app.textFields["serverURLField"]
        XCTAssertTrue(addressField.waitForExistence(timeout: 20))
        addressField.tap()
        addressField.typeText("office.example.test")
        app.buttons["saveServerButton"].tap()
        waitForSavedServer("Office", in: app)

        let officeActions = app.buttons["Actions for Office"]
        XCTAssertTrue(officeActions.waitForExistence(timeout: 20))
        officeActions.tap()
        app.buttons["Edit"].tap()
        XCTAssertTrue(nameField.waitForExistence(timeout: 20))
        nameField.tap()
        nameField.clearAndEnterText("Work")
        app.buttons["saveServerButton"].tap()
        waitForSavedServer("Work", in: app)
        XCTAssertTrue(app.staticTexts["Home"].exists)

        let workActions = app.buttons["Actions for Work"]
        XCTAssertTrue(workActions.waitForExistence(timeout: 20))
        workActions.tap()
        app.buttons["Delete Work"].tap()
        let deletionAlert = app.alerts["Delete server?"]
        XCTAssertTrue(deletionAlert.waitForExistence(timeout: 3))
        deletionAlert.buttons["Delete"].tap()

        app.terminate()
        let relaunchedApp = XCUIApplication()
        relaunchedApp.launch()
        XCTAssertTrue(relaunchedApp.staticTexts["Home"].waitForExistence(timeout: 5))
        XCTAssertFalse(relaunchedApp.staticTexts["Work"].exists)
    }

    private func waitForSavedServer(_ name: String, in app: XCUIApplication) {
        let saveButton = app.buttons["saveServerButton"]
        XCTAssertTrue(saveButton.waitForNonExistence(timeout: 30), "The server editor should close after saving \(name).")
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 30), "The server list should show \(name) after saving.")
    }
}

private final class OriginFixtureServer {
    private let listener: NWListener
    private let queue = DispatchQueue(label: "seerrng.origin-fixture")
    init(port: UInt16, target: UInt16) throws {
        listener = try NWListener(using: .tcp, on: NWEndpoint.Port(rawValue: port)!)
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { state in
            if case .ready = state { ready.signal() }
            if case .failed = state { ready.signal() }
        }
        listener.newConnectionHandler = { connection in
            connection.start(queue: self.queue)
            connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { data, _, _, _ in
                let request = String(data: data ?? Data(), encoding: .utf8) ?? ""
                let body = "<html><meta name=viewport content='width=device-width'><body style='padding:72px 20px;font:18px sans-serif'><h1>\(port == target ? "Redirected origin fixture" : "Origin fixture")</h1><p>Check the server address above before signing in.</p><a href='/redirect'>Continue sign-in</a></body></html>"
                let response = request.hasPrefix("GET /redirect ")
                    ? "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:\(target)/auth\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    : "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n\(body)"
                connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in connection.cancel() })
            }
        }
        listener.start(queue: queue)
        guard ready.wait(timeout: .now() + 5) == .success else {
            listener.cancel()
            throw NSError(domain: "OriginFixtureServer", code: 1)
        }
    }
    func stop() { listener.cancel() }
}

private extension XCUIElement {
    func clearAndEnterText(_ text: String) {
        guard let currentValue = value as? String else {
            typeText(text)
            return
        }
        let delete = String(repeating: XCUIKeyboardKey.delete.rawValue, count: currentValue.count)
        typeText(delete + text)
    }
}
