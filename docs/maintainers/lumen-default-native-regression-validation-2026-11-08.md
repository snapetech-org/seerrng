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
