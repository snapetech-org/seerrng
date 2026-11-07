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

The report does not establish physical-device gesture feel, native Plex playback,
all older Android versions or a full light/dark screenshot comparison. Those
remain separate acceptance checks. XML reports and the complete build log are
retained in incoming-review20261106 deliverables as `android-593-reports` and
`android-593-qualified.log`. Subsequent documentation-only commits do not change
the validated Android source.
