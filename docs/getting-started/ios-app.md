# SeerrNG iOS client

The iOS source client connects to a SeerrNG server you already run. It does not
start a server on the phone. Its SwiftUI server manager adds, edits and removes
saved server URLs; each server has a persistent WebKit profile. Server pages and
sign-in flows are rendered by the configured server.

## Obtain a build

Check the assets of the [SeerrNG release](https://github.com/snapetech-org/seerrng/releases)
you intend to install. An iOS Simulator `.app` ZIP is for Xcode's simulator and
cannot be installed on a physical iPhone. Device installation needs a properly
signed distribution build and the applicable Apple provisioning. Source code or
a simulator package does not establish App Store availability.

The [iOS build guide](https://github.com/snapetech-org/seerrng/blob/main/ios/README.md) describes Xcode setup, bundle identity,
simulator packaging, optional Ad Hoc/App Store exports and signing prerequisites.
The [mobile readiness checklist](../mobile-release-readiness.md) records remaining
store, purchase, privacy and distribution acceptance. Check those gates before
promising a device or store release.

## Connect safely

Add the HTTPS URL you use for your server, including any reverse-proxy prefix.
The app supports multiple servers and browser navigation. Use a certificate the
device trusts. HTTP connections expose credentials and session data to network
observers; the client presents an HTTP warning. Review the current server
address when following redirects or opening sign-in content.

The website's media permissions and availability rules remain authoritative.
Switching servers does not turn the client into an acquisition provider or grant
access to another user's library. For a web-only alternative, open the server in
Safari. Android installation has a separate [APK guide](./android-app.md).

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
