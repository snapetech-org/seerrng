# Visible Lumen administration — 2026-11-09

## Defect and repair

The reported Lumen sidebar had no administrative entry points. Presentation settings and the full SeerrNG escape existed only near the bottom of You, so administrators could reasonably conclude that their controls had disappeared.

The desktop sidebar now exposes **Administration → Lumen Settings / SeerrNG Administration**. You shows the same destinations immediately below the account card on phones and tablets. The second link uses the existing `fullSeerrUrl` owner, retaining same-origin `/seerrng`, configured companion destinations, protocol validation and the classic-interface escape. Full configuration pages remain in native SeerrNG; this change does not claim those pages were rebuilt inside Lumen.

The existing `.side` CSS owner now scrolls vertically and its links retain their established height instead of shrinking on short screens. Existing sidebar, section, settings-list, action and icon owners supply all other styling. No new CSS family or Tailwind utility was introduced. A shared administrator predicate rejects malformed masks across navigation, You and Lumen Settings; server authorization remains authoritative.

## Qualification

Baseline: main `80cea98db28ae773afa6656c2110a56c71a2031b`. Candidate: these changes on that source.

- Full production build passed, including Lumen TypeScript/Vite and Next/server builds.
- Lumen native tests: **33 passed**, zero failures or skips.
- Headless Chromium browser suite (`admin-navigation`, existing `admin-options`, `theme`): **363 passed, one existing skip**, across desktop, iPhone, Android and tablet projects. Includes regular accounts, delegated settings-only accounts, malformed masks, configuration URLs, presentation settings, request controls, storage recovery and theme switching.
- Matching baseline/candidate rendered comparison: **16 states**, light/dark × 1440×900, 1280×640, 1024×768 and 390×844. Routes `/`, `/me`, `/me/lumen`; all extra categories enabled. Inspected navigation geometry, wrapping, action reachability, profile placement, neighboring content and horizontal overflow. Links open the actual Lumen Settings page. Short desktop navigation scrolls without squeezing rows; phone/tablet entry points remain above request limits. No page errors or horizontal overflow in these states.
- Actual bundled production app: synthetic seeded administrator and regular accounts signed in using real CSRF/session endpoints. Administrator navigated from `/lumen/` into Lumen Settings and then through `/seerrng` into visible native Settings, preserving the same authenticated user and classic-interface cookie. Mobile `/lumen/me` exposed both links. The regular account had neither admin link, saw the direct Lumen Settings denial, and received **403** from `/api/v1/lumen/config`; administrator received **200**.
- Root ESLint applied to the touched Lumen files reports the **same 30 pre-existing findings** on baseline and candidate (22 relative-import rules, seven existing label rules, one existing caught-error rule). No rule was disabled. Changed files pass Prettier and diff whitespace checks. The full production build verifies the restored shared dependency cache is usable.

## Evidence and exclusions

Evidence retained on kspld0 at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-20261109/`: baseline/candidate viewport PNGs, `visual-report.json`, `visual-qa-qualified.log`, `browser-tests-qualified.log`, `lumen-unit-tests.log`, `production-build.log`, `embedded-qa-final.log`, `embedded-report.json`, `embedded-admin-phone.png`, `embedded-native-settings.png`, and baseline/candidate lint JSON.

Synthetic accounts, empty catalog responses and isolated config only; no household provider writes. Production fixtures skipped migrations and periodic jobs, so this does not qualify migrations or real provider availability. The companion URL behavior was browser-tested with fixtures; no household sidecar was modified. Native settings navigation was tested, but this work does not requalify every native settings page or theme.

Excluded harness attempts used WebKit device defaults with a Chromium executable, an incorrect tablet breakpoint, a nonexistent storage endpoint, or a hidden native-sidebar selector instead of the visible Settings heading. The isolated install initially targeted a shared dependency symlink; it was stopped and the original cache was restored using its frozen lockfile and offline package store, then reinstalled after isolation was corrected. Setup logs remain retained. These attempts are not counted as product acceptance.
