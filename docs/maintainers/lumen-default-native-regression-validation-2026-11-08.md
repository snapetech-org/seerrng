# Native interface qualification after Lumen adoption — November 8, 2026

Lumen is the default entry. The full native interface initially uses Persius;
a signed-in account's explicitly saved Orig or John preference still loads.

## Product fix

`PersiusAccountLabel` read `data.movie.limit` before checking whether the movie
quota existed. Adult-only and music-only responses crashed the entire client,
including the interval before a saved Orig or John stylesheet/composition was
ready. The existing label owner now tolerates an absent movie quota and retains
its normal allowance display when supplied. Five focused render checks pass.
There are no CSS value or geometry changes.

A production rebuild reproduced the failure before the guard and passed all ten
adult workflows and all six music-detail/request workflows after it. Music was
checked at 320, 390 and 1440px with both Orig and John. These browser cases replay
catalogue/partial quota responses and use real local authentication; they do not
certify a household Whisparr or Lidarr deployment.

## Explicit native test fixtures

Cypress's upstream layout suite selects Orig in its login session initializer,
leaving its existing geometry assertions intact and allowing individual tests to
change the preference afterward. Navigation waits for the actual account theme
and finite presentation transitions to settle. The carousel helper scrolls its
row into view and waits for the requested card before measuring, preserving lazy
loading and its position-restoration assertions. All eight focused Cypress
settings-layout and carousel cases pass headlessly with Chromium
(`lumen-cypress-native-qualified.log`). The initial local Electron run could not
capture screenshots; those failed logs remain retained. Lumen/default-entry
cases remain separate.

Provider recovery and rating controls are exercised by navigating from an
already-settled native shell. This avoids branching on a transient first-render
Persius control while a saved Orig preference loads. The maximum four attempts
assertion is unchanged. The six provider sorting/recovery browser cases and four
rating/filter cases pass.

The public native login now uses Persius before an account preference exists.
The obsolete assumption that public login defaults to Orig was replaced with an
explicit default-native login test. It checks measured Persius field width
278/336px (390/1440px viewport), 42/38px field height, 16px Plex icon, rejected
credentials and horizontal overflow. Both cases pass. Authenticated Orig
composition/geometry remains covered by its independent theme checks.

The shared Manage spacing contract now locates the low-specificity `:where`
fallback owner. Its token, gap/margin and negative regression assertions remain
intact; focused checks pass. The old `:is` selector expectation was the sole
native test failure in CI run 42495432233. That run also failed its browser and
fresh-profile expectations; it is not a qualified release head.

## Evidence and delivery

Production build: `lumen-quota-native-production-build.log`.
Label regression: `lumen-quota-label-regression.log` (five passing).
Browser run: `lumen-native-ci-qualified.log` (29 passing; one subsequent
account-navigation fixture repair required). Account switching explicitly
reopens `/seerrng` after logout, waits for the actual account theme, and opens
Persius desktop's More disclosure before selecting Issues. Phone navigation
uses the existing More navigation menu. The repaired desktop and phone cases
pass separately in `lumen-account-qualified.log` (desktop) and
`lumen-account-phone-qualified.log` (phone).

Evidence directory:
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107`.
Exact-head full CI, published artifacts and the broader historical issue audit
remain separate delivery gates. No claim of a published fix is made here.

## Fixture typecheck gate

The standalone Cypress project now targets ES2020, matching its existing BigInt
fixtures and supported browser runtime. Its observer doubles implement the
current DOM `scrollMargin` contract; select and SVG assertions use their actual
DOM types. The success-toast callback keeps retrying assertions with an explicit
HTML subject. The native navigation overwrite returns the same Cypress subject
type in authenticated and anonymous branches. `pnpm cypress:typecheck` passes for
the complete fixture project and runs before binary installation/build in the
existing Cypress CI job. Runner routing and permissions are unchanged.

The request-list opt-in reuses the shared boolean query validator. Regenerated
API-message source locations and the complete prebuild/i18n/73-role checks pass.
CI run 42501598947 caught the earlier stale source-location manifest before its
browser jobs could run; it must not be described as a successful browser run.

## Full-suite discovery fixture follow-up

The full Cypress job at `39d2d14f0` reached the browser suite and found seven
failures. The local CI-seeded reproduction isolated the remaining assumptions:

- The native visit helper must retain its explicit classic choice across a
  restored login session and skip theme assertions for inert cache-reset HTML.
- Discovery filter requests and request-list media types use state-specific
  aliases; a Persius header badge's separate request must not satisfy a
  book/music list assertion. Query and clear/exclude assertions are preserved.
- The shuffled-music test must declare music availability. Its underlying CI
  configuration has music disabled; its first request occurred before the
  optional-category guard redirected away. All movie/series/music/book seed
  refresh assertions remain intact after enabling the fixture capability.
- Login return transport uses a stable main-settings path with a query and
  fragment. The old Prowlarr Services target now intentionally redirects to
  its dedicated settings page, covered separately.

The focused CI-seeded reproduction passes all 14 Discovery, 27 book/music
parity, and three theme/refresh cases. All six login cases pass, including the separate legacy Prowlarr redirect.
Evidence: `lumen-cypress-ci-repro.log`, `lumen-cypress-seeded-qualified.log`, and
`lumen-cypress-login-qualified.log`. These are fixture changes, with no further
application behavior changes after `39d2d14f0`.

## Final Playwright seed-state qualification

The full Playwright run at `39d2d14f0` passed 599 cases, skipped one, and found
two remaining fixture assumptions. Its retained network traces confirm that the
account-cache case's users had no settings object, while the theme-switch case
began with John already saved. The cache test now resolves an absent preference
to Persius consistently when opening the desktop More disclosure. The theme test
starts from Orig, then verifies John's actual stylesheet/save responses and
persistence, and restores the original preference afterward.

All three focused cases pass against a freshly prepared CI database, including
account switching on desktop and phone. The original private-text isolation,
full-document navigation probes, stylesheet response, save response and reload
assertions remain intact. Evidence: `39-playwright-failures` and
`lumen-final-native-fixture.log`. These repairs change tests only.

## Compact native selection text

Visual inspection of the partial-quota captures exposed a separate shared-owner
bug: compact native selects retained the browser form reset's 8px top and bottom
padding inside a 24px control. On phones their 22px inner box left only 6px for
16px text. The shared `select.compact-control` owner now removes block padding,
following the existing compact settings/select treatment. Theme height, inline
padding, typography and appearance remain owned by their existing packages.

The unmodified production baseline fails the measured text-space assertion on
mobile. A matching 390/1440px comparison that removes only the new CSS rule from
the compiled response reproduces four failures (Persius and John); Orig's taller
controls pass. The actual rebuilt candidate passes all six theme/viewport cases,
including changing the discovery server and request destination. The original ten
adult interaction cases also pass. Twelve settled discovery/dialog captures and
their two contact sheets were inspected. This qualifies those two representative
consumers of the shared select role, not every page using compact controls.

Evidence: `compact-select-baseline.log`, `compact-select-matched-baseline.log`
(four expected failures, two passes), `compact-select-settled.log` (16 passes),
`compact-select-final.log` (six settled cases), `compact-select-final-artifacts`,
`compact-select-production-build.log`, and `compact-select-owner-regressions.log`
(72 passes) in the evidence directory above. Catalogue/quotas are replayed;
authentication, theme persistence, native rendering and navigation are real.


## Focused tooltip dismissal and native preferences

Final-head CI 42510740631 passed 606 browser cases and skipped one, but the
keyboard-entry case expected the first Escape to close its request dialog. The
HD-only fixture now correctly has no quality chooser. Its first focusable control
is the Advanced Options pin, which opens a focus tooltip. The retained CI trace
and an instrumented production-browser reproduction show one tooltip at Escape
capture and no bubbling key event: the child dismisses the tooltip. The existing
shared focus hook deliberately respects handled child Escape events; changing
that would break child-control dismissal.

The fixture now declares its HD-only public capabilities to match its provider
responses. The keyboard test waits for the actual focused pin and tooltip, then
asserts first Escape removes the tooltip while retaining the dialog and second
Escape closes the dialog. The focused production-browser case passes. This is a
stronger layered keyboard assertion, not a change to the shared focus owner.

The independent Plex save fixture also waits for its requested Orig/John theme
and for the initial Persius composition to leave before clicking. Its existing
independent-form, failed-save draft, retry and repeated-save assertions remain;
all eight cases pass. Earlier CI 42509761563 failed its first-click readiness
assumption while its other jobs passed. Logs for both failed CI runs and local
probes remain retained. These fixture changes make no product CSS, API or focus
behavior change.

Evidence: `eef-playwright-completed-job.log`, `eef-playwright-failure`,
`persius-escape-probe.log`, `persius-escape-qualified.log`,
`settings-independent-qualified.log`, and `persius-fresh-ci-qualified.log` in the
same evidence directory. The complete Persius file uses the actual fresh CI seed;
a separate rich household fixture intentionally had an episode-queue default
that selects a different tree and is not the season-picker reference. The fresh
CI-seed full file passes 19 cases with one existing installed-package skip.
