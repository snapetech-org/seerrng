# Book Availability Follow-Up — Issue 409

Issue [#409](https://github.com/snapetech-org/seerrng/issues/409) remains open.
The earlier provider-scoped Chaptarr lookup fix does not establish that all
reported availability behavior is resolved.

## Confirmed Defects Repaired in This Milestone

After declining or removing the last book request, the subscriber inferred
`AVAILABLE` from ebook or audiobook manager record IDs. Those records can exist
without imported files. It now returns `UNKNOWN` unless an actual scanned
Audiobookshelf/Plex library item independently proves availability; existing
`AVAILABLE` and `DELETED` states are preserved by the callers. The manager links
are retained for future reconciliation.

The book detail page independently labeled manager links as available even when
the aggregate library state was `PROCESSING` or `UNKNOWN`. It now uses the
existing shared book-availability check for format labels and their associated
availability explanations. A queued request displays Requested; a cancelled,
missing-file title displays Not Available; an imported ebook stays Available.

The semantic owners are `MediaRequestSubscriber`, `bookAvailability`,
`BookDetails` and the existing `BookDetailsLayout`/`AvailabilityValue` consumers.
No CSS, typography, spacing, button dimensions or theme values were changed.

## Verification

- Real SQLite subscriber regressions: eight failures on the previous source;
  all 72 subscriber cases pass after the fix, including 14 cancellation cases.
  The matrix covers declining/removing queued ebook, audiobook and dual-format
  manager records, existing availability, confirmed Audiobookshelf/Plex library
  items, incomplete library links and service ID zero.
- Actual production HTTP deletion: four isolated queued requests on each build.
  The baseline changed Processing to Available; the candidate changed Processing
  to Unknown. Persisted database readback confirmed all manager IDs were kept.
  The media-list API intentionally omits those IDs, so persistence was checked
  directly rather than inferred from that response projection.
- Production server and client builds pass. Provider traffic was guarded and
  scheduled jobs disabled in the isolated runtime.
- `/book/OL82563W`, SeerrOrig and SeerrNGJ, 390×900 and 1440×900, queued,
  cancelled and imported states: 12 matched baseline/candidate captures. Four
  browser cases pass across all three states, with no page errors or horizontal
  overflow. Contact sheets and full-size changed summaries were visually
  inspected; geometry, shared controls and neighboring content are preserved.
- The browser comparison uses provider metadata and empty-download fixtures;
  it is not a claim of live Chaptarr, Audiobookshelf or Plex acquisition testing.

Evidence is retained under the task deliverable directory
`seerrng-book-availability-409-20261106`: baseline/candidate native reports,
HTTP and persisted-database receipts, production build logs, matched screenshot
manifest, contact sheets and full-size comparisons. Initial harness failures
are retained separately; corrected checks use the actual title including its
publication year and the documented media-list sort parameter.

## Initial Milestone Limitation (Superseded by the Candidate Below)

The aggregate media status cannot reliably distinguish an imported ebook from a
queued audiobook when both manager record IDs exist. The shared availability
helper and other consumers still need explicit, persisted per-format file
observations and source-aware cleanup. Migration must not fabricate file
availability from manager IDs. Scanner, acquisition-worker, request-target,
API and client projections need consistent reconciliation and regression
coverage before this issue can be called resolved.

This milestone repairs cancellation and incorrect detail labels; it does not
claim that the entire mixed-format availability report is fixed. Publication
of this follow-up must be recorded separately from the frozen v3.72.16 UI
replacement candidate.

## Per-format File Evidence Fix

The follow-up records `availableEbookServiceIds` and
`availableAudiobookServiceIds` separately from manager record IDs. Readarr,
Chaptarr and Bindery scans and successful acquisition tracking publish actual
file observations. Each destination can remove only its own observation.
Incomplete file statistics preserve a previous observation. Audiobookshelf
and Plex library evidence remains independent, and ABS cleanup reloads the
media row under its mutation lock before changing availability.

Dispatch, completion/history, format labels, request cards, author/series work
cards, library eligibility, discovery and default-format selection use this
file-backed state. A completed provider handoff with an acquiring target remains requested without becoming available or enabling a duplicate request. Confirmed removal clears the removed destination's evidence.
Exact provider recordings additionally require their selected target to report
imported files; a manager handoff does not establish recording availability.

SQLite and PostgreSQL migrations add nullable text observations without deriving
file evidence from existing IDs. Legacy manager-only AVAILABLE rows become
UNKNOWN until the next enabled availability scan. Operators should rescan their
enabled book services after upgrading. Migration reruns preserve positive
observations; rollback removes the new columns without resurrecting the old
unverified availability claims. Native PostgreSQL 16 migration up, repeat and down checks passed on an isolated local database.

Local qualification is complete; #409 stays open pending CI on the committed
main revision. The production server/client build, prebuild contracts and lint
(no errors) pass. The final admission/helper suite passes 257 tests, including
full request routes, stale completion, mixed-format files and alternate profiles.
Earlier focused scanner, subscriber, cleanup, notification and tracking suites
passed; SQLite and isolated PostgreSQL 16 migration up/repeat/down checks pass.

Headless Chromium against the production build passes eight book states across
SeerrOrig and SeerrNGJ at 390×900 and 1440×900. The checks exercise missing-format
requests, bibliography selection, acquiring-target duplicate protection and
alternate-profile requests. Author, series, profile, request-list and discovery
pages pass another four browser groups (20 captures). Matched published-v16
and candidate screenshots were visually inspected: 32 book summary captures,
20 shared consumer pairs and request dialogs retain their geometry while
correcting availability and request eligibility. Provider responses are fixtures;
this is not a claim of live Chaptarr/ABS acquisition acceptance.

The new migration intentionally requires an enabled service rescan to populate
legacy file observations. The separate compact-summary readability problem at
320px remains tracked in `compact-summary-theme-validation.md`; no CSS is
changed by this availability milestone.
