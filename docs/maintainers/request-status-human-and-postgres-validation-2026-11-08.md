# Request Status human and PostgreSQL checks — November 8

These checks extend the closed-issue audit for #104 and #243. They do not replace
issue-specific proof for unrelated download clients or every historical issue.
The tested app is the production build of acd7fc057. Request Status, its native
worker and download-tracker source are unchanged from published v3.72.23.

## Human workflow and actual worker observations

A separate task-owned process runs the compiled production app and exposes a
loopback-only test bridge for invoking its compiled download tracker and status
recorder. The bridge is test code outside the repository and is not an app API.
Using the same process is required because tracker snapshots are held in memory.
The prepared movie requests and Radarr provider are synthetic; no household
service, download, email or physical playback is involved. Browser movie metadata
is explicitly replayed; status APIs, authentication, SQLite persistence, Retry,
provider HTTP queue/history reads and compiled worker calculations are real.

One end-to-end workflow passes with SeerrOrig and SeerrNGJohn at 390x900 and
1440x900 for each of six states: failed, searching after the owner's real Retry,
downloading with unknown size, downloading with observed 1000/250 byte totals,
importing, and a simulated confirmed library observation. The measured progress
is 75%; unknown progress has no percentage bar. The last observed importing
queue supplies 100%, which remains real evidence rather than an invented number.
The timeline/history persists across reload. An ordinary user with only Request
permission cannot read another user's status detail and does not see that user's
request in the actual status list. This does not claim a real Plex scan or every
provider's unavailable/import/error behavior.

Four additional cases simulate only the first status-list HTTP 503. The person
sees Request Status Could Not Be Loaded and an enabled Retry action; clicking it
loads the real backend response and replaces the error with the request card.
Both themes and viewports pass. This establishes recovery behavior separately
from PostgreSQL query correctness.

The initial prepared fixture lacked a Radarr lookup response, so subscriber
processing marked its synthetic requests failed. The fixture was completed and
the owner's real Retry then succeeded. An early assertion expected a null
percentage after availability even though the fixture still supplied a confirmed
100% import queue; correcting that expectation required no production repair.
These harness failures are retained, not misreported as application defects.

## PostgreSQL regression now runs instead of silently skipping

The original #243 fix has a real PostgreSQL regression in
`server/lib/requestStatus.postgres.test.ts`. The full native CI job had no database
URL, and the isolated test runner stripped that variable even when explicitly
provided. Its previous successful full-suite totals therefore included this skip.

The runner now accepts `--postgres`, requiring SEERR_TEST_POSTGRES_URL for a named
loopback PostgreSQL database. Ordinary runs still discard that variable, application
database URLs and other database credentials. Missing/malformed/non-loopback URLs
fail instead of silently skipping; the runner cleans its own temporary config even
on this early failure. HTTP network restrictions and isolated settings remain.
CI's existing PostgreSQL tooling job runs the regression with this explicit mode;
no hosted/private routing, permissions or CodeQL policy is changed.

The actual PostgreSQL 16.15 query test passes: one executed, zero skipped. Ten
focused environment cases and four runner cases pass, including default isolation,
IPv4/IPv6 loopback, rejected input, output completion and owned-config cleanup.
The query uses temporary tables in a rolled-back transaction. The local database
is a task-owned container on an internal network; a task-owned loopback bridge is
used because that network does not publish its requested port. No existing
PostgreSQL container or application database is used.

Evidence remains on kspld0 under
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/`:
`status104-human-qualified*`, `status243-human*`, `issue243-postgres-qualified2.log`,
`issue243-runner-tests.log` and `issue243-env-unit.log`. The original skipped run
and failed loopback-port harness attempt remain alongside them. Live CI validation
of the updated workflow is a separate pending gate at this checkpoint.
