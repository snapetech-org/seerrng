# Lumen request status qualification — November 8, 2026

Issue: [#614](https://github.com/snapetech-org/seerrng/issues/614).

## Failure and ownership

Lumen's Requests page inferred readiness from the aggregate media status. An
approved audiobook request therefore appeared **In library** when only an ebook
file existed. The running production server's request-status endpoint correctly
reported **Searching** for that same SQLite request. The browser failure was
reproduced with real authentication, request list and status APIs; only title
metadata was replayed. The exact request link identified the affected card.

The request-status engine remains the authority. `GET /request?includeStatus=true`
projects the already-authorized, hydrated page (maximum 100 requests), using
batched timeline, dispatch and book-import lookups. This read does not append
history. Download identifiers use the existing public alias sanitizer. Omitted
or false options preserve the original list response and avoid projection work.

Lumen consumes fresh per-request projections before considering aggregate media
status. It distinguishes searching, importing, library checking and availability,
and displays only finite download percentages in range. A legacy backend may
reject the new query with 400; only that response permits a plain-list retry.
Book fallback checks requested-format file evidence; magazine and sports fallback
does not infer readiness from aggregate tracking. Game/software requests retain
their separate API and identifier namespace. A failed own-history read now shows
an error and Retry instead of reporting an empty successful history.

## Executed checks

- Two focused real API tests pass: format-specific status, owner isolation,
  opt-in/default response, no history writes and malformed query rejection.
- The request-status owner/reconciliation/OpenAPI regression run passes 42 tests.
- Production server compilation and bundled/standalone Lumen builds pass.
- Thirty-two browser checks pass across desktop, iPhone, Android and tablet:
  searching, library checking, zero/unknown/invalid progress, unknown stages,
  older-backend fallback, outage handling and visible Retry.
- The original actual SQLite/API/browser failure passes after the fix. The
  requested audiobook remains Searching despite aggregate media status 5 and an
  ebook file. Its normal Requests card and shared status/detail styles were
  visually inspected; no CSS values or owners changed.

Evidence is retained in the task deliverable directory
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107`:
`lumen-request-truth-proven-baseline.log`,
`lumen-request-final-truth.log`, `lumen-status-projection-api.log`,
`lumen-status-owner-regression.log`, `lumen-status-browser-qualified.log`, and
corresponding screenshots/traces. Provider titles are synthetic; these checks do
not certify household provider credentials or physical mobile devices.

## Delivery gate

This is source qualification, not a published-release claim. Issue #614 remains
open pending exact-head CI and verification of the published replacement build.
The broader issue audit and theme/browser qualification have independent gates.

## Lifecycle filter membership and counts

Extending the same real SQLite/API/browser case to a completed-but-missing-audio
request exposed another boundary: the legacy `GET /request?filter=available`
returned a row whose projected stage was Approved. The administrator's Available
view consequently contained a nonavailable request. The lifecycle endpoint's
Available filter already excluded it correctly.

Lumen's Available and Downloading queries now reuse `GET /request/status` for
format/destination-aware membership and pagination. Their snapshots are mapped
into the existing card owner. This endpoint retains its existing durable status
observation behavior; the separate ordinary list projection remains read-only.
Processing also keeps older active audio transfers reachable when an existing
ebook has made the aggregate media status Available. Counts for these two chips
come from the corresponding lifecycle page total, not coarse media flags.

A 400/404 permits a legacy list fallback; unverified formats are excluded from
Available and its coarse count is withheld. Authorization failures, outages and
malformed successful lifecycle payloads show the existing Retry state and cannot
downgrade to coarse availability. Other filters keep their existing API.

Both real 390/1440px Available-filter checks fail before and pass after this
repair. The nine additional browser cases cover membership, exact counts,
older audio downloads, legacy fallback, 401/403/503 and malformed responses.
The complete Lumen browser run passes 503 tests with 13 viewport-specific skips;
the focused request-status matrix passes 68. No CSS values or component geometry
owners changed. Evidence: `lumen-available-filter-human-proven-baseline.log`,
`lumen-available-filter-human-qualified.log`, `lumen-filter-browser.log`, and
`lumen-filter-full-browser.log`, with their matching artifact directories.
The prepared actual-artifact Lumen scenario includes both missing-format rows
and six human checks; preparation alone is not release acceptance.
