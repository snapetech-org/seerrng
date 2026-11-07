# Android contribution593 review

PR593 adds current Android Back handling, system/keyboard inset padding, device
dark mode, selected-server/WebView restoration and tapped Plex app handoff.
The original contribution head is88a3807e69a03a635b3945586438f98a37606f9c.

The review found that stripping components and URI grant flags did not remove
page-supplied actions or extras from parsed Android intents. The patched handler
constructs a fresh `ACTION_VIEW` intent with `CATEGORY_BROWSABLE`, only an approved
Plex/HTTP/HTTPS target and its optional package. It carries no supplied flags,
components, selectors or extras. Safe HTTP/HTTPS fallback remains separate;
local/executable schemes and credential-bearing URLs are rejected.

[Hosted validation42315272983](https://github.com/snapetech-org/seerrng/actions/runs/42315272983)
passed at e7655a5506a0975aada6c70ad9ecd940662aeff8:10 unit tests,15 connected
Android16/API36 tests and the debug APK build. Four connected tests verify intent
sanitization and rejection. The local HTTP WebView test also recreates the
activity, checks the selected page and status-bar padding, then uses Back to
return to the server picker. The run uses a disposable hosted VM, read-only
repository permissions and no release signing credentials. The release job is
skipped on this review branch.

The follow-up [appearance run42317429318](https://github.com/snapetech-org/seerrng/actions/runs/42317429318)
passes at b28f22fca30d36bdf1f3b13d1458592b921aca70 with the same Android source.
It captures the candidate and actual published v3.72.16 APK on phone and
1280x800 tablet layouts in device light/dark modes. All four matching pairs were
visually reviewed: the status bar becomes legible, content clears its inset,
shared controls retain geometry, and dark mode uses readable dark surfaces.
The published baseline APK checksum is verified before installation. The first
capture harness encountered connected-test cleanup uninstalling the target; the
corrected harness explicitly installs the already-built debug APK first.

The report does not establish physical-device gesture feel, native Plex playback
or all older Android versions. Those remain separate acceptance checks. XML reports and the complete build log are
retained in incoming-review20261106 deliverables as `android-593-reports` and
`android-593-qualified.log`. Subsequent documentation-only commits do not change
the validated Android source.
