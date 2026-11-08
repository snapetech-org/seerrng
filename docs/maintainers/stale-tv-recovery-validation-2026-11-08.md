# Deleted TV files: administrator recovery and actual re-request qualification

Issue #199 was reopened after human workflow testing contradicted its earlier
resolution receipts. Baseline `066a2df90` shows an enabled Request action when
viewer-scoped media-server verification masks an old AVAILABLE database status,
but submission still checks destination availability and returns HTTP 409:
`This series is already available at the selected destination.` All eight
SeerrOrig/SeerrNGJohn × 390/1440 × absent/present zero-file Sonarr record cases
reproduce this. A visible Request action did not establish resolution.

The administrator recovery control was hidden because it consumed viewer-masked
status. Its provider plan also confused an existing Sonarr series tracking entry
with remaining files. The shared library plan now exposes administrator-only,
freshly verified stale qualities, derived from persisted media/season status and
all configured providers of that quality. Existing Sonarr tracking records remain
Delete From Library targets; a separate, bounded episode-file inventory check
must prove an empty array before recovery is offered. Non-array responses fail,
and even malformed nonempty arrays count as occupied. No normalized/defaulted
file counter is used as absence evidence. Sonarr series inventory uses its strict
identity-preserving mode. Radarr retains its existing absent-record requirement.

The existing confirmation re-fetches the complete plan under its authorization,
service and media mutation admissions. File presence, service changes, no checked
quality, blocklisting and failed verification prevent clearing. The token binds
the verified recovery qualities as well as provider configuration and removal
targets. Only stale SeerrNG media/season availability changes; tracking entries,
files, historical requests, issues, watchlists and identities are preserved.

The existing ManageMediaActions, Button and Modal owners render the recovery.
No CSS, design values, dimensions or theme package changes were added. The English
explanation and source fingerprints were refreshed; this is not a claim of
reviewed translations in every locale. OpenAPI describes the administrator-only
plan and quality evidence.

## Evidence

- 104 native tests pass, zero skipped: media routes and Sonarr API contracts.
  Includes zero-file records, real request admission after recovery, files
  appearing after confirmation, absent provider/configuration, permissions and
  strict malformed/nonempty file inventory handling. An initial new-test target
  count assumed one configured Sonarr; the shared fixture has two. The corrected
  assertion checks the configured collection; that was a test fixture mistake.
- 50 Vitest tests pass: shared library resolution and rendered management actions.
  Includes viewer UNKNOWN status with administrator-verified stale HD availability,
  configured service ID zero, occupied/failed inventories and unavailable quality.
- Production prebuild, i18n checks, server and Next.js builds pass; focused ESLint
  passes. The initial prebuild correctly required new/changed English source
  fingerprints; these were reviewed and regenerated rather than bypassing checks.
- Twelve actual-browser cases pass against the compiled production application,
  SQLite and a read-only loopback Sonarr HTTP fixture. Eight cases use both themes,
  390/1440×900, record absent/present: open Manage Series, inspect recovery, confirm,
  observe HTTP 204, sign in as an ordinary requester, submit a real HTTP 201 pending
  TV request, reload, read persisted pending status, and delete only that new pending
  fixture request. Four negative cases cover both themes with present files or a
  failed provider inventory. No provider mutation or download is performed.
- Four maintained Playwright regressions pass locally. These deliberately mock
  provider/detail responses to retain the viewer-mask/control/confirmation
  boundary in CI; they do not replace the real UI/API/database cases above.
- Matching baseline/candidate management and confirmation screenshots were reviewed
  for readable controls, flow, spacing and overflow. Both viewport widths remain
  inside the document. The added recovery uses the established shared action owner;
  Open provider, Delete From Library, Blocklist, request and issue controls retain
  their existing arrangement. This does not certify every historical UI route.

Full evidence, unsuccessful baseline probes, fixture mistakes, logs and screenshots:
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/issue199-*`.
Configurations: corresponding task cache `issue199-config` and
`issue199-candidate-config`. Fixture providers accept GET only; all availability
and file inventories are synthetic. No production database/provider was changed.

Issue #199 remains open pending release delivery. This source receipt supersedes
the earlier assertion that endpoint/OpenAPI coverage proved the human workflow.
