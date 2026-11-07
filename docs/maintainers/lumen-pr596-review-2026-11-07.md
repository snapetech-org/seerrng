# Lumen PR #596 review — November 7

Reviewed contributor head `485677b1e38fdd83b4437a5b26d3ba532d2c6b06` against
base `f7bc03b4`, including nginx/njs filesystem writes, session checks, branding
responses, client cache/session boundaries, request mutation permissions and UI.
Integration preserves the contributor commits through a merge, with local repairs.

Findings repaired before merge:

- Uploading a second logo deleted the still-configured first logo before the
  follow-up settings save. A failed save or concurrent admin could break everyone's
  branding. Earlier images are retained; nginx request IDs prevent same-millisecond
  filename collisions. Baseline regression fails; repaired filesystem and actual
  nginx tests pass. Operators can remove unused images deliberately later.
- One-day cache retention was checked only when storage was loaded. A long-lived
  tab could keep older entries, and future timestamps could remain fresh. Both
  cases fail against the contribution and pass with expiration on read.
- The Everyone tab represented a failed request API call as an empty history.
  It now shows an explicit error and Retry. The failed baseline and four viewport
  retry checks are retained.

Security boundaries checked:

- Writes require SeerrNG's current authenticated administrator permission, not a
  client-side flag. Anonymous, non-admin and malformed auth responses are denied.
- JSON-only config PUT, body size caps, object validation and fixed filesystem
  destinations remain enforced. File names contain server-generated values.
- Uploaded SVGs are served with `default-src 'none'`, `sandbox`, and `nosniff`.
  Actual production nginx tests check these headers, auth denial, malformed/large
  input, invalid images, config readback and continued access to the live logo.
- Existing proxy tests retain configured-peer forwarding trust and the companion
  session gate. Earlier requested commits `676768fc5` and `835c271e3` remain in
  history and their forwarding/Plex link behavior remains covered.
- UI role gating does not replace backend authorization. Existing browser cases
  check Everyone visibility, Request As permission combinations and mutation
  payloads. No live household request is made.

Validation: contributor-feature browser suite 327 passed, 13 intentional
viewport-only skips; eight matching baseline visual cases; eight focused final
error-retry/sign-out checks. Native production-image suite initially passed 24;
additional cache lifetime and nginx endpoint regressions were added during review.
The final native production-image suite passes all 27 cases; the final four error-state render/retry cases pass. Root CI and publication are tracked separately. No blanket claim
about all historic contributions or all 73 issues follows from this review.

Artifacts:
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/lumen-*`.
Phone/desktop light/dark baseline/candidate settings, request-sheet and sign-in
captures were compared. New controls use existing Lumen layout owners. This
standalone Lumen review does not change Orig/John theme ownership.
