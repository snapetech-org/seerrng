# Lumen upgrade, storage and book-library qualification

Scope: issues [#629](https://github.com/snapetech-org/seerrng/issues/629) and
[#625](https://github.com/snapetech-org/seerrng/issues/625), plus contribution PRs
[#624](https://github.com/snapetech-org/seerrng/pull/624),
[#626](https://github.com/snapetech-org/seerrng/pull/626),
[#627](https://github.com/snapetech-org/seerrng/pull/627) and
[#628](https://github.com/snapetech-org/seerrng/pull/628).

## Root causes and corrected behavior

- Bundled Lumen's root redirect applied to every initialized installation, without
  a persisted choice or distinction from an independently configured companion.
  Upgrade migration now preserves native home access. Fresh setup keeps included
  Lumen. General settings expose native/included/companion choices, and direct
  native access works before authentication. Companion settings are not imported
  or replaced.
- Companion storage failure hid Save/Upload and hardcoded UID 101 in guidance.
  Controls now remain visible, disabled when unavailable, with actual UID/GID,
  mount/ownership help and a recheck that preserves edits. Docker's non-root user
  selects UID/GID; no root entrypoint, extra capabilities or writable app files
  were introduced. Host Compose `.env` values are distinct from container env.
- Historical book identity rows can differ from rows with confirmed file evidence.
  Read projections combine exact service-scoped provider IDs/work identities.
  They preserve records/relations, exclude pending/unconfirmed observations and
  keep other services separate. Library, detail and duplicate admission consume
  the same evidence; no destructive database reconciliation or provider writes.

## Contributor review

Reviewed all changed code and tests at the four published PR heads before
integration. No dependency or workflow trust changes are introduced. Sign-out
retains the session after failure; only an already-ended 401 session is treated
as signed out. Request pagination preserves authoritative status errors and
session-generation guards. Edition identity aliases come from the negotiated
provider adapter, not a client assertion. Added Audiobookshelf URL handling and
browser cases for path prefixes, query/fragment removal, credentials and unsafe
schemes. Removed contributed inline retry spacing in favor of the existing role.

## Local production and browser evidence

Task-owned evidence is retained on kspld0:
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-routing-permissions-20261109/`.
The corresponding isolated worktree and cache use the same task basename.

- Actual v3.72.26 amd64 main image reproduced a root redirect to `/lumen/` and no
  pre-authentication native escape at desktop and phone sizes.
- Matching native General settings captures: Orig, John and Persius at
  390×900, 768×900, 1024×900 and 1440×900. Candidate saves and reloads interface
  choices; invalid URLs recover safely; no overflow or page errors. Existing
  form, select, message and button owners remain in use; no CSS owner changed.
- Included Lumen sign-in captures at those four viewports show its identity and
  native escape. Fresh empty config reaches native setup from `/` and `/lumen/`.
- Real companion nginx image at UID/GID 1000:1000, all capabilities dropped,
  no-new-privileges, read-only root and `/tmp` tmpfs: save, reload and PNG logo
  upload pass at 390×900 and 1440×900. A separately mounted read-only data volume
  reports readonly/1000:1000, disables visible controls, retains the draft on
  recheck and rejects a forced save with 409.
- Running candidate backend, task-owned SQLite and read-only Chaptarr contract
  fixture: Martian/Threshing Day/Wool audiobooks and Threshing Day/Fourth Wing
  ebooks appear in In library. Owned detail actions and duplicate-request 409
  checks pass at 390×900 and 1440×900; provider fixture rejects all writes.
- Lumen browser suite: 603 passed, 13 pre-existing skips across desktop, iPhone,
  Android and tablet; eight additional Audiobookshelf security cases passed.
- Production companion proxy/security/container suite: 33 passed. Root Vitest:
  5,197 passed, six skipped. The full native run found one pending Plex-reference regression (4,880 passed, six skipped, one failed). It was corrected with a stale-reference regression case; all 313 affected author/book/request checks then passed. Earlier routing/settings checks passed 101 tests; final routing and observation tests also pass. Lint has no errors;
  translation and UI contracts pass with existing translation-review warnings.

Live Plex/Jellyfin, Chaptarr and Audiobookshelf installations belonging to users
were not mutated. The provider fixture validates integration contracts and
reported data shapes, not an exhaustive qualification of every external provider
version. Browser-native app launch remains device-dependent. New setup was
rendered with an empty configuration; external OAuth/media-server enrollment is
covered separately by existing authentication tests.

## Follow-up before tagging

A mixed movie/music list still waited for the album lookup because progressive
rendering required a placeholder for every category. Two headless tests reproduced
this on the integrated build. Ready rows now render immediately; extra-category
rows join in order as metadata arrives. An all-extra list retains its loading state
until it has an actual row, avoiding a false empty message. All 16 slow-list cases
passed across four viewports before the follow-up commit. Baseline failure traces
and candidate screenshots remain in the task evidence directory. Native/backend
sources are byte-identical to the preceding integration for CI reuse; Lumen and
release-note contracts must qualify the final head separately.
