# Compact summary and full-route theme validation — 2026-11-06

## Report and root cause

The reported Columbo Request Series dialog had an oversized poster, vertically
misaligned title/details, and a malformed Advanced Options control. The theme
packages applied primary-detail geometry to every summary/poster consumer.
SeerrOrig's desktop bottom alignment and 192px poster leaked into the request
summary's compact grid; SeerrNGJ also enlarged compact posters. The disclosure
button had no geometry owner for a leading Heroicon SVG.

The primary movie, TV, book, music and sports summaries now explicitly select
`data-summary-layout="detail"`. MovieSummaryCard defaults to `compact`; theme
packages scope their existing large geometry to the explicit detail role.
Compact summaries retain the existing shared 64px/80px poster geometry. Large
primary summaries keep their existing theme-specific dimensions and alignment.
The shared disclosure owner sizes only leading SVGs through the existing
content-height variable; chevron and pin ownership remains separate. The book
Advanced Options variant keeps its approved dimensions.

Ten page identity titles with legacy local sizes now consume `page-title`:
author, artist, person, backend book-series, downloads, library, calendar (and
its coming-soon alias), provider discovery, library migration, advanced theme.
No table, section or compact card heading was recategorized.

## Reproduction and validation

Evidence root on kspld0:
`/mnt/disks/scratch/task-deliverables/seerrng-theme-qa-20261106/`.
The published v3.72.15 image is the immutable baseline; the candidate runs from
the task worktree on an isolated fixture database. Provider metadata is mocked
at its documented API boundary; screenshots render production components and
actual theme stylesheets. No live provider mutations are used for visual QA.

- Baseline request geometry: all eight strict regression cases fail on v3.72.15.
- Candidate requests: 12 cases pass, covering movie/series, both themes,
  320px/390px/1440px widths, compact geometry, retained primary-detail dimensions,
  disclosure icon geometry and expanded Advanced Options without overflow.
- Focused style contracts: 76 passed.
- Production build, lint and server/client type checks passed.
- Route inventory: 150 page entries (94 ordinary static, 52 dynamic, four
  anonymous routes). Each signed-in entry is captured at 390×900 and 1440×900
  in SeerrOrig and SeerrNGJ. Anonymous login/setup/reset/callback pages use the
  shared default theme by design; no account-theme variant is claimed before
  authentication. The dynamic password-reset form is additionally captured
  anonymously. Wrapper/error boundaries are exercised through page consumers.

The 584 matched signed-in route captures were compared with the immutable
baseline; 453 were pixel-identical. Contact sheets for every candidate route,
full-size changed request dialogs, populated request-status/history, issue
list/focused issue and blocklist cards were inspected in both themes and widths.
The ten anonymous form/callback/setup captures were also inspected. Pixel
changes outside the repaired roles include live log/job/status data and tiny
sidebar icon rasterization differences; these are not layout regressions.

The 38 shared-consumer browser cases passed (books, collection summaries,
primary media layouts, poster rating position and the original eight request
cases), including English/Arabic and the existing third-theme controls. A
further 16 request cases passed at 360, 640, 768 and 1024px. The added 320px
movie case caught a 7px approval-value overflow in SeerrOrig. Attaching the
existing `card-table-value` role, already used by TV, fixes it without another
CSS owner. All 12 permanent request cases pass after this repair.

Populated request status revealed a separate date defect: date-only
`1999-10-15` displayed as October 14 in America/Regina. Only calendar release
metadata now formats with UTC, matching the detail-page convention; request
creation/history timestamps keep local-time behavior. Four rendered regression
cases reproduce the old date failure in both themes and widths. All four candidate date cases and all 12 request-dialog cases pass together
on the final rebuilt v3.72.16 candidate (16 total); their full-size screenshots
were inspected in both themes. Complete CI and release artifact acceptance
remain pending. A route screenshot or no-overflow
assertion alone is not visual acceptance. Empty/error states caused by disabled
offline providers are retained separately from populated model fixtures.
Initial harness failures (incorrect similar/collection fixture shapes and one
server-readiness race) are retained in the evidence root, corrected and rerun;
they are not attributed to product code.

## Published v3.72.16 Verification

The immutable image at
`ghcr.io/snapetech-org/seerrng@sha256:b2bd0d2288898efcdb602f1f4863e86dff3fed1cfba5641d54072ab4702942fa`
reports v3.72.16 and revision `f59078f413a9f790e5a5fdcd1744b324f2f02ac5`.
It was started with real migrations on a separate fixture database. The final
candidate CI run 42275431200 passed, including 4,636 native passes and five
intentional skips. Release run 42284183094 completed successfully after retrying
the timed-out Intel macOS archive job; the published release contains 29 assets.

The actual image produced 584 signed-in route captures at 390px and 1440px in
both account themes, plus ten shared anonymous captures. It passed 16 critical
request/status tests and four populated request/issue/blocklist consumer groups.
Theme picker clicks for both themes saved successfully and survived reload on
both viewports. No container restart or OOM occurred. One initial gallery group
hit a harness auth-response race; the harness now snapshots read-only auth
responses, and that group passed on retry. The failed attempt is retained.

Against the previously reviewed candidate, 489 captures are pixel-identical.
The 95 differences were inspected in eight paired contact sheets: live version,
jobs/logs, loading/error state timing, fixture images and small navigation/hover
regions account for the differences. Seven additional contact sheets cover the
actual packaged request dialogs and request status states. The narrow 320px
summary checks verify geometry and overflow; long metadata values still use the
existing truncation behavior at that width and need a separate readability fix.
This is not acceptance of every possible provider, permission or failure state.
Provider metadata fixtures and unconfigured-provider recovery states do not
establish live acquisition or physical device acceptance.

All 21 current and legacy registry references were independently read back at
the image digest above. The first legacy check preceded completion of the
workflow mirror; its log confirms successful promotion at 21:42:43 UTC. A local
mirror repeated the same digest without changing the published artifact.
Evidence includes `release16-alias-readback.json`, `release16-alias-job.log`,
`published16-qa-summary.json`, the critical/theme-picker logs and screenshots.
