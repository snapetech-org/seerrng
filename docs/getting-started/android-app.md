# SeerrNG Android App

The SeerrNG Android app is a small client for servers you already run. It loads
the SeerrNG web interface, so the server must stay installed and reachable on
your network. The APK does not contain or start a SeerrNG server.

## Install or update

1. Download `seerrng-<version>-android.apk` and its
   `seerrng-<version>-android.sha256` file from the
   [SeerrNG GitHub Releases](https://github.com/snapetech-org/seerrng/releases).
2. Check the APK checksum with `sha256sum -c seerrng-<version>-android.sha256`
   on Linux or macOS.
3. Open the APK on your Android device. If Android asks, allow your browser or
   file manager to install apps from this source, then finish installing.

Install a newer APK over the existing app to keep its saved server list and
sign-ins. Releases use the same app signing key; uninstalling first removes the
app's saved data.

## Add and switch servers

On first launch, the app opens the server address form. Enter an optional name
and the address you use in a browser, then save it. Later launches open your
saved server list. Tap **Add Server** to add more; **Edit** changes a server's
name or address, and **Remove** deletes that server and its saved sign-in from
this device.

The URL can include a port and reverse-proxy path, for example
`https://requests.example.com/seerrng`. If you leave off `https://` or `http://`,
the app uses HTTPS. The address is saved locally on the device. Each server
uses its own WebView profile, which keeps cookies, local storage, and sign-ins
separate when the installed Android System WebView supports multiple profiles.

Plex, Jellyfin, Emby, and local account sign-in use the SeerrNG web interface.
The app keeps those flows in its WebView so the server session remains
available when sign-in returns. It does not add a JavaScript-to-Android bridge.
File downloads use Android's Download Manager and are saved in the Downloads
folder. Android 9 and earlier asks for storage permission the first time.

## Connection security

Use HTTPS for servers that are reachable outside a trusted home network. HTTPS
certificates must be trusted by Android. The app cancels certificate errors;
it does not offer a “continue anyway” option. If you use plain HTTP, the app
shows a warning before the first connection and keeps an **HTTP · Unencrypted**
label visible while connected. Passwords and session cookies sent over HTTP can
be read by other people on the network.

If an older Android System WebView cannot isolate server profiles, the app asks
before connecting to multiple saved servers and clears the previous session
when you switch. Update Android System WebView for persistent, independent
sign-ins.

The APK does not provide native push notifications. If you rely on SeerrNG web
push, use the browser-installed SeerrNG app for those notifications.

## Release signing and sideload distribution

Release builds must use one stable Android signing key. Keep an offline backup
of the keystore; every update must use that same key. Never commit the keystore
or its passwords. Configure these repository Actions secrets before running a
release:

- `ANDROID_KEYSTORE_BASE64`: base64-encoded keystore file.
- `ANDROID_KEYSTORE_PASSWORD`: keystore password.
- `ANDROID_KEY_ALIAS`: key alias.
- `ANDROID_KEY_PASSWORD`: key password.

For example, create a JKS key with
`keytool -genkeypair -storetype JKS -keystore seerrng-release.jks -alias seerrng -keyalg RSA -keysize 4096 -validity 10000`, then encode the keystore with
`base64 -w0 seerrng-release.jks` on Linux. Store an offline copy somewhere safe
before putting the encoded value and passwords in repository Actions secrets.

Before distributing the APK broadly, register package
`org.snapetech.seerrng` and its signing key in the
[Android Developer Console](https://developer.android.com/developer-verification/guides/android-developer-console).
Android's developer verification rollout began regional enforcement on
September 30, 2026, with broader rollout planned for 2027. See the
[Android developer verification guide](https://developer.android.com/developer-verification/guides)
for current distribution requirements.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
