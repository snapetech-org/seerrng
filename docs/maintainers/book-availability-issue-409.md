# Book Availability Follow-Up — Issue 409

Issue [#409](https://github.com/snapetech-org/seerrng/issues/409) was resolved in
[v3.72.19](https://github.com/snapetech-org/seerrng/releases/tag/v3.72.19) after
verifying both the provider-scoped lookup repair and the separate file-evidence
defects. [Final public resolution](https://github.com/snapetech-org/seerrng/issues/409#issuecomment-6701620023).
The milestone notes below retain their original implementation and validation
sequence; the final qualification supersedes their pending closure gates.

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

At this milestone, local qualification was complete and #409 stayed open
pending CI on the committed main revision. The production server/client build, prebuild contracts and lint
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

## Independent library and mixed-format cancellation follow-up

Three additional regressions failed on the first file-evidence milestone.
Deleting the last confirmed manager copy reset the entire book row, losing
independent ABS/Plex evidence. A completed ebook operation also entered active
cancellation while its audiobook was still pending and failed with incomplete
tracking. Manager deletion now removes only that destination's observation and
matching manager link; independent media-server keys and other observations stay.
Cancellation skips already-imported operations and withdraws the remaining work.
Both complete media-route and cleanup suites pass61 tests after the repair.
Baseline failures and final readback evidence are retained in the409 archive.

Main CI on the first milestone found two available-library fixtures and one
Cypress discovery fixture still using manager IDs as their entire proof. They
now explicitly seed imported-file observations. The library regression suite
passes8 tests, including exclusion of manager-only legacy AVAILABLE records.
Final integrated main CI remained the closure gate; old failing runs were not
used as qualification of these later fixes.
# Public Plex evidence after redaction

The final response audit reproduced another missing-audio case: ordinary users
lost Plex-only audiobook evidence when the private `ratingKey` was removed.
Responses now carry the read-only `hasPlexAudiobookFile` boolean before redaction.
It remains independent of manager observations, applies only to audio, and cannot
override an unavailable status. Resetting native media-server keys clears the
response flag. The missing-copy regression fails before the change; focused
availability/privacy/provider tests and server typecheck/lint pass afterward.


## Audiobookshelf Format Evidence Follow-up

The additional scan review found a separate format-classification defect:
Audiobookshelf book libraries support ebook-only entries, but SeerrNG treated
any valid item ID as an audiobook file. Two SQLite regressions reproduced new
false availability and stale-link retention on the v3.72.18 source.

The scanner now shares one audio-file predicate between admission and the
complete-scan seen-item inventory. Expanded responses need a valid audio-file
record that is not missing, invalid or excluded. Minified responses need a
positive safe integer audio count, and a positive track count when provided.
Metadata alone, ebook-only rows, contradictory arrays/counts and malformed
values do not establish audio availability. Pagination completeness remains a
separate prerequisite; incomplete scans still preserve prior observations.

The focused scanner/file-evidence suite passes 46 tests, and the three
SQLite ebook-only/independent-format regressions pass after the repair.
The latter confirms that removing false ABS audiobook evidence preserves
confirmed manager ebook files and ebook availability. Existing positive
fixtures now include actual audio-file observations instead of assuming
that a metadata record represents a file. Server typecheck and scoped lint pass.
No live household ABS acquisition is claimed. Rescan the enabled ABS library
after upgrading to refresh legacy observations.

Primary contract references: [ABS ebook support](https://audiobookshelf.org/docs/documentation/libraries/book-library/ebooks/)
and [ABS Book API objects](https://api.audiobookshelf.org/#book).
The correction does not add ebook ingestion through ABS; its existing
SeerrNG integration supplies audiobook availability.


## Published Qualification — v3.72.19

[Full source CI](https://github.com/snapetech-org/seerrng/actions/runs/42328148067)
passed at `1e23ef329a1dfb96da328cf2b6d0a70715170401`: 4,719 native tests
passed, five intentional skips and zero failures. Build, typecheck, lint, browser
suites, tooling, docs and Helm checks passed. The
[release](https://github.com/snapetech-org/seerrng/actions/runs/42331055907)
published 29 assets on November 7, 2026 UTC. All 21 canonical and legacy image
aliases were verified at manifest digest
`sha256:7a6df31ce2d6f71d12242c0820f502787a3dab623ea829ffd6a7b4ef31c6f36f`.

The downloaded image's labels and HTTP status identify that exact source. Its
compiled scanner passed an isolated HTTP/SQLite proof for three ebook-only and
stale-audio cases, retaining an independently confirmed ebook. Its running app
passed 51 critical UI checks and four persisted book-state groups across both
interface themes at phone and desktop sizes. All six compiled CSS files and
both served theme packages match the verified v3.72.18 image byte for byte.
Fourteen of 16 book-state/dialog captures match the source captures pixel for
pixel; the other two have reviewed placeholder/loading paint differences with
identical geometry. All four request dialogs were visually inspected.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-incoming-review-20261106`.
After upgrading, rescan the enabled book libraries to rebuild file-backed
observations. These isolated provider fixtures do not claim live household
acquisition testing or add ABS ebook ingestion.
