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
- Candidate requests: eight cases pass, covering movie/series, both themes,
  390px/1440px widths, compact geometry, retained primary-detail dimensions,
  disclosure icon geometry and expanded Advanced Options without overflow.
- Focused style contracts: 76 passed.
- Production build, lint and server/client type checks passed.
- Route inventory: 150 page entries (94 ordinary static, 52 dynamic, four
  anonymous routes). Each signed-in entry is captured at 390×900 and 1440×900
  in SeerrOrig and SeerrNGJ. Anonymous login/setup/reset/callback pages use the
  shared default theme by design; no account-theme variant is claimed before
  authentication. The dynamic password-reset form is additionally captured
  anonymously. Wrapper/error boundaries are exercised through page consumers.

Full candidate visual review, shared consumer checks, complete CI and release
artifact acceptance are still in progress. A route screenshot or no-overflow
assertion alone is not visual acceptance. Empty/error states caused by disabled
offline providers are retained separately from populated model fixtures.
Initial harness failures (incorrect similar/collection fixture shapes and one
server-readiness race) are retained in the evidence root, corrected and rerun;
they are not attributed to product code.
