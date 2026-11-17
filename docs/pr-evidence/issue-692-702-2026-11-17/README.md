# Request, integration and release recovery — 2026-11-17

## Scope and ownership

Reviewed and merged PRs #691, #693, #694 and #695, including timeout retry,
exact edition pinning, local edition identity and ISBN lookup regressions.
The effective Next.js installation is 16.4.5; both the direct dependency and
workspace override now agree. The matching AppImage WASM archive was downloaded
and its SHA-512 integrity verified against npm metadata before pinning it.

The screenshot's Episode Queue failures are covered by real SQLite request
persistence with isolated Plex and Sonarr API fixtures: no work before the
starting episode imports, a three-episode buffer after import, manual Plex
watched-state advancement without an active session, advancement when session
reads fail, and no duplicate child on repeated reconciliation. The existing
playback matrix still covers Plex/Jellyfin/Emby and household playback. A
29-season tree loads in six requests, each containing at most five seasons,
without changing the selected starting episode. This is deterministic
integration evidence, not a claim of playback on the reporter's real server.

Software creation and approval reject other users' matching active/available
requests and confirmed ROMarrNG library ownership. Admission serializes
simultaneous submissions; distinct selections, including patches, remain
separate. The UI disables only the chosen available/tracked system; another
system remains selectable. API tests verify no provider dispatch on rejection.

## Rendered comparison

Baseline source: `436972db7`. Candidate: this change. Both use the actual app
and the same metadata/status fixtures in separate disposable configuration
roots. Service workers are blocked and reduced motion is enabled. All screenshots
in this directory contain synthetic fixture data.

| Route/state | Viewports | Evidence and interaction |
| --- | --- | --- |
| `/requests`, Persius request dialog, populated History | 390, 620, 1440 × 900 | `baseline-request-dialog-*` and `candidate-request-dialog-*`; measured outer overflow ≤1 px, title aligned with unchanged 64/80 px poster widths, timeline right arrow moves the scroll position, metadata/history wrap within the dialog |
| `/requests`, Orig and John summaries | 390, 620, 1440 × 900 | Existing shared consumers pass the same geometry/date checks; nine total request-summary browser cases pass |
| `/movie/424242`, `/tv/424242`, missing provider ratings | 390, 1440 × 900 | `baseline-ratings-*` and `candidate-ratings-*`; baseline has six visible slots, candidate has only the known TMDB score; separate render tests retain valid zero and cached known values |
| `/discover/movies`, `/discover/tv`, Persius scrolling | 1440 × 900 | Two browser cases observe zero per-card detail reads while rendering/paging cards; list payload supplies metadata and availability |
| `/software?category=retro&game=42`, available/tracked target | 390, 1440 × 900 | `software-target-*`; four browser cases verify disabled chosen target and enabled Request after selecting a different system |

Semantic owners: existing request-dialog container layout, card-title typography,
poster badge tokens, timeline overflow owner, shared history table, VideoRatings,
and TitleCard. Persius action-button sizing excludes informational poster chips,
which retain the shared poster-control dimensions. No page-local CSS override or
new Tailwind styling was introduced.

The isolated desktop pool could not reach the LAN preview and was released.
An owned headed Chrome session on the persistent Agent GUI connector reached the
candidate, signed into the disposable account, and exercised the native theme
picker and Requests shell. Fixture comparisons and interactions above are from
the maintained browser suites. No real provider, household, or account mutation
was performed. Owned browser sessions were closed.

## Security and release gates

- Full Vitest run: 750 files passed, 4 skipped; 5,638 tests passed, 8 skipped.
- Tooling: 415 passed, 4 skipped; no failures.
- Server/client type checking, lint, locale integrity and shared UI checks pass.
- Installed dependency audit: zero vulnerabilities. GitHub open dependency and
  code-scanning alerts: zero at the final source audit. CodeQL remains disabled.
- Pinned Semgrep CE 1.184.0: 45 existing reviewed findings, zero unreviewed,
  changed or expired findings. Parser diagnostics remain in the scan report.
- Email templates use a shared HTTP(S) URL allowlist, reject credentials/control
  bytes, and encode CSS delimiters. Eight email tests pass, including all four
  rendered templates with malicious URLs. The targeted template scan has zero
  findings; obsolete template baseline exceptions were removed.
- AppImage compiler checksum coverage and current CI action fixtures pass.

Initial broad failures were corrected rather than suppressed: stale fixture
metadata, filesystem mock lifetime, a dispatch counter including setup work,
missing comic classification fixture, stale contract expectations and three
array-type lint violations. Production build and hosted release/artifact
verification are recorded by the release workflow for the final tag.

## Locale repair and retained data

The prebuild catalog gate found 4,133 obsolete keys, 8,039 empty values,
24 incompatible ICU contracts and one invalid ICU string. Active catalogs now
omit these entries and use the existing locale/English fallback path. All 3,591
nonempty removed values are retained in `quarantined-translations.json`, with
locale, message identity and disposition. No translation was marked reviewed,
no missing translation was invented, and plural/review warnings remain explicit.

Task scratch and baseline worktree: `/tmp/seerrng-all-fixes-20261117` on `kspld0`.
Logs and security reports are retained separately before scratch cleanup. Existing
unrelated browser/profile state and the pre-existing Git stash are preserved.


## Full release-gate follow-up

The first complete hosted CI run (44116176293) exposed stale native-theme browser/source expectations, global formatting failures, and additional interaction defects. The follow-up preserves native disclosures and clean-save footer behavior while testing failed drafts, successful persistence, and repeated saves explicitly. Bounded season API fixtures now model the production array response and five-season batching.

The native detail and collection frames used a fixed 493 px height despite longer content. They now retain a 493 px minimum and grow with content; the shared page owner reserves its search-bar offset. Metadata retry feedback renders inside the frame. User-list controls reuse the shared wrapping action-row owner. Association-list ResizeObserver callbacks schedule measurement for the next animation frame and skip unchanged CSS values.

Matching `/users` screenshots at 1024 × 900 are retained as `users-baseline-1024.png` and `users-candidate-1024.png` in the external validation bundle. The measured document overflow fell from 132 px to 0 px. Follow-up collection tests cover three themes, English/Arabic, and 390/1440 px. Logs and browser traces are retained in the external validation bundle; final gate results are recorded after completion.


The full native Node suite passed 5,241 tests (7 skipped). The local production build and lint passed. The production Playwright rerun passed 311 cases with one skipped and exposed seven remaining fixture failures; the focused follow-up passed all 13 cases covering those failures. Chromium Cypress passed the repaired association, layout, integration, navigation, request, search, watchlist, settings, and user cases; the final integration rerun passed all 22 cases. Electron failure screenshots timed out locally; Chromium provided the local UI check and the configured hosted browser remains a final release gate.

A newly observed Trakt callback race came from moving the integrations component between theme-dependent parents after it consumed the callback query. The integrations component now retains one parent, and callback feedback opens the native disclosure. No authentication credentials or provider callback tokens are stored in these artifacts.
