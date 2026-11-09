# iOS saved-server cleanup qualification

Issue: [#622](https://github.com/snapetech-org/seerrng/issues/622).

The first v3.72.25 iOS test job crashed with SIGSEGV on
`com.apple.WebKit.WebsiteDataStoreIO`, inside `WTF::RunLoop::dispatch` called
by `WebsiteDataStore::removeDataStoreWithIdentifierImpl`. The main thread was
finishing model tests. The same-source retry passed; that does not resolve the
observed initialization race.

`ServerStore.remove` can remove a server that has never opened a web view.
Initialize WebKit through `WKWebsiteDataStore.default()` on the existing main
actor before scheduling the static removal API. WebKit's
[defaultDataStore implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/WebsiteData/WebsiteDataStore.cpp)
calls `InitializeWebKit2`; its
[static removal implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/WebsiteData/Cocoa/WebsiteDataStoreCocoa.mm)
dispatches to the main run-loop singleton without that initialization.
Server browsing still uses UUID-specific stores; no session data is moved to
the default store. The existing SwiftUI release delay remains.

Qualification: native iOS unit and UI tests plus simulator packaging on the
current main revision. The existing model tests exercise removal without an
opened browser; the UI tests exercise add, edit, delete and persistence.
A passing run is required before claiming this repair qualified. Physical
iOS-device testing remains outside this session. No rendered UI changes.

Original evidence is retained under the task deliverables directory,
`release25-ios-diagnostics/`, including decoded crash JSON and the xcresult.
