# v3.72.29 browser release qualification

The first full CI run against release preparation `466d45ec6` was
[42733667180](https://github.com/snapetech-org/seerrng/actions/runs/42733667180).
It exposed a product defect and stale browser fixtures before any v3.72.29 tag
or public release was created.

## Product correction

John's `.media-page` shell has an established negative header offset. When a
cached detail page rendered its error banner before that shell, the shell
intercepted clicks on the visible Retry button. The movie and series layouts
now own a slot for the existing, localized `PageErrorMessage` node inside the
shell. Orig preserves its existing banner placement; the native series shell shares the correction. No CSS,
spacing tokens, theme dimensions, permissions or provider writes changed.

The movie defect reproduced locally on the production baseline at both 390
and 1440 pixels. Candidate recovery explicitly supplies cached server metadata
and a failed client refresh for both movie and series. Real Retry clicks,
confirmed watchlist mutations and denied/missing title states pass in Orig and
John at those same viewports. Screenshots were inspected for banner position,
header clearance, detail geometry and overflow. These are isolated fixtures,
not claims about a user's live media server.

## Browser fixture corrections

- Header user-menu assertions now select the search bar's menu. Persius also
  intentionally exposes a sidebar user menu.
- Carousel tests navigate through the visible third card's actual link, then
  assert the exact saved position after Back in English and Arabic at 390 and
  1440 pixels in Orig and John. The prior private-router call could overlap
  navigation. The fourth card would require test-induced scrolling on mobile.
- Plex settings tests establish the seeded server session before installing
  browser API fixtures. A mocked `auth/me` alone cannot authorize server-side
  settings navigation. The unauthenticated setup fixture remains separate.
- Service tests use the current Book Acquisition Services heading and retain
  their modal layout, guidance-link and category-visibility assertions.

The production candidate passed all 43 targeted navigation/metadata checks
and all eight Plex discovery, rate-limit and setup checks. The build also
passed localization, semantic UI style guards and TypeScript compilation.
The two affected Cypress suites also pass all 31 tests. Full final-commit CI
and release artifact qualification remain separate gates.

## Evidence

Local logs, retained failure traces and matching viewport screenshots are in
`/mnt/disks/scratch/task-deliverables/seerrng-release29-final-20261109/` on
`kspld0`. Initial tests started before readiness, the inaccessible fourth-card
selector experiment and superseded fixture runs are retained as diagnostics;
only qualified runs after the readiness check establish acceptance. No live
provider accounts or household configuration were modified.
