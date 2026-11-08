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
