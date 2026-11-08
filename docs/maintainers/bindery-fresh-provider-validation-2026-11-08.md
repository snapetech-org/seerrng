# Fresh Bindery metadata provider — November 8

Issue [#610](https://github.com/snapetech-org/seerrng/issues/610) reports that a
fresh Bindery installation returns 404 for an unstored `metadata.primary_provider`
setting. The shared client propagated that response before dispatch or scanning.

The setting reader now treats that endpoint's 404 as Bindery's Open Library
default. Explicit provider values and malformed-value handling remain unchanged.
Authentication, authorization, rate-limit and server errors still propagate.
No settings are written to Bindery, no ownership mappings are inferred, and no
availability is fabricated from request acceptance.

Validation on the current source:

- The new real HTTP missing-setting test fails on the baseline with Axios 404.
- Client, tracked book-search and scanner suites: 65 passed, zero skips.
- Request subscriber suite: 75 passed, zero skips. The new case uses a real
  loopback HTTP Bindery fixture for missing setting, status, user mapping lookup
  and POST request. It verifies the explicit requester mapping wins over a
  conflicting display name, the Open Library ID reaches `/requests`, the direct
  owner fallback is unused, and the persisted operation remains pending.
- The fixture's external Open Library metadata and notifications are stubbed.
  This proves production dispatch with HTTP and SQLite; it does not prove a
  household Bindery download or imported-file availability.
- Server typecheck and focused ESLint pass. No rendered UI or style changes.

Retained evidence on kspld0:
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/bindery610-*.log`.
This repair is after immutable v3.72.24; keep #610 open until it is delivered and
its actual artifact is qualified. It is not part of that release.
