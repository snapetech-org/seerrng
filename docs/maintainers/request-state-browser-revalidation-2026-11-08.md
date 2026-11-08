# Immediate request state and browser caching — 2026-11-08

Issue [#91](https://github.com/snapetech-org/seerrng/issues/91) was reopened
when its human workflow reproduced on the v3.72.24 candidate. A successful
request POST returned 201 with APPROVED request and PROCESSING media state;
an independent API read confirmed persistence. The browser reused the old
movie response with transfer size zero because shared API middleware allowed
`private, max-age=300, stale-while-revalidate=1800, stale-if-error=1800`.
The page continued showing an enabled Request action. The earlier subscriber
repair was necessary but did not prevent this independent browser-cache bug.

The shared `apiResponseCache` owner now uses `private, no-cache` for media
and related catalog responses. These combine provider metadata with mutable
request, availability, watchlist and viewer-policy state. Conditional ETags
remain usable for unchanged responses, but every reuse must validate. Error
responses cannot be replaced by stale success responses. Existing server-side
provider caches, private no-store credential responses, special media-server
state, settings and image-cache policies are preserved.

## Qualification

- Baseline browser trace: POST succeeds; API state persists; the next browser
  movie GET reuses the original response and Request remains enabled.
- Candidate: actual production frontend, compiled Express server, SQLite,
  real movie metadata, ordinary REQUEST + auto-approve user and scoped
  read-only Radarr fixture; Orig/John at 390 and 1440. Create via human modal,
  immediate Processing feedback, disabled duplicate action, reload/readback,
  and status API approved/searching with no fake download percentage.
- The fixture returns an already monitored movie and no download queue row
  for each title. It performs no real acquisition. Each created QA request
  is deleted and the user's original permission mask restored in finally.
- Native cache regression covers movie, TV, book, collection, person, music,
  author and artist responses, unchanged 304, changed 200 after mutation,
  credential privacy, errors, discover and settings policies (10 passing).
- Server compile and focused ESLint pass. No rendered component, CSS, geometry,
  dimensions, palette or theme composition is changed.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/`:
`request91-human-debug`, `request91-human-qualified3`,
`request91-cache-native.log`, `request91-server-build.log` and `request91-lint.log`.
Earlier harness failures assumed John's action had Orig's label or that
Processing was plain text in Orig; those assumptions were corrected to the
actual theme-specific control and accessible status. They required no app fix.

This is source qualification, not proof that a released artifact contains the
repair. Keep #91 open until the replacement artifact is published and tested.

## Sportarr #347 follow-up

The current production candidate passed Test-before-profile, unreachable Test
502 with draft retention, successful Test loading profiles, profile selection,
Connect, reload/Edit typed-port and profile readback, and ordinary-user PUT
403. Orig and John passed at 390 and 1440 (four workflows). Provider inspection
recorded 12 authorized reads and zero writes. All temporary services were
removed, the original empty settings list restored, and the scoped fixture
stopped. No additional production fix was required beyond the existing
`17845c261` repair. Public receipt:
https://github.com/snapetech-org/seerrng/issues/347#issuecomment-6719281164.
