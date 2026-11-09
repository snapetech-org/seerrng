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
and candidate screenshots remain in the task evidence directory. The frontend correction does not change backend behavior. Final qualification records each source revision explicitly; no stale failed job is treated as a passing check.

## Native browser entry contract and CI partitioning

The original native browser run passed 617 cases and skipped one; its two failures
still asserted that every upgraded installation must enter Lumen. Those cases now
verify native upgrade entry, a visible pre-authentication escape, explicit admin
selection of Lumen, friend-account access in both interfaces, logout behavior and
bundled manifest/icon paths. Both corrected cases passed locally against the rebuilt
3.72.28 production app before commit.

The complete native browser suite runs in four isolated Ubuntu 24.04 jobs using
Playwright’s file sharding. Each instance retains one worker and an independent
prepared database/configuration; assertions and cases are not removed. All shards
continue after another shard fails and retain distinct screenshots, traces and
complete JSON results. The `browser` dispatch action reruns this suite and its
release-note contract without duplicating already-qualified native/backend jobs.
Live execution on the selected public runner class is required before publication.


## Follow-up contribution #630

Reviewed ncbudd's original `0b3a78794609bb2ecfad6fd9200a5615e40b5c68`
([PR #630](https://github.com/snapetech-org/seerrng/pull/630)). It extends the
library repair to catalogues larger than 200 identifiers, pools exact same-work
file observations within a scanner service/format, tolerates Chaptarr's specific
missing-row error, finalizes verified recording files before metadata lookup,
and backs off metadata outages and deleted manager records. Local audiobook
catalogue search is a fallback when remote metadata search fails.

Review corrections retain provider and explicit format boundaries for edition
aliases; require matching work identity before a linked numeric record can finish
a request; run bounded identifier/media/summary database batches; and preserve
both-format and active-handoff request states. Detail provider failure returns a
sanitized 503; only a successful exact miss returns 404. No new dependency,
workflow privilege, remote deletion, or user-data merge is introduced.

The outage reconciliation tests now isolate already-dispatched requests from the
background delivery outbox and create a fresh manager per case. A transaction
completion assertion guards fixture teardown. The workflow contract tests include
the browser dispatch option. Final source qualification and publication receipts
will be appended after those checks finish; #625 and #629 remain open until the
replacement images are published and verified.


### Local follow-up qualification

The integrated production build passes; all 295 affected native tests and 15
catalogue Vitest cases pass. Live rebuilt backend plus the read-only Chaptarr
fixture supplies 260 additional ebook and audiobook records. Both formats render
through title 260 at phone/desktop sizes; original issue examples and duplicate
409 guards still pass. A forced metadata outage produces a Retry action rather
than a false missing edition, while local catalogue search returns the known
Martian audiobook. These high-volume fixture checks use the existing
`E2E_TESTS=true` rate-limit exemption after the ordinary production 30/minute book
limit correctly interrupted the combined test sequence; deployed defaults are
unchanged. No provider writes are permitted by the fixture.

The first standalone follow-up browser run used the older standalone `lumen/dist`
(the root production build writes `public/lumen`), and its new cases exposed that
stale preview. Preserved those results separately, rebuilt the standalone artifact
from current source, and reran the full suite. The actual included production
workflows above use the new `public/lumen` artifact. Keep the standalone and
included artifact identities explicit in future qualifications.


Final local follow-up: 651 Lumen browser cases passed, 13 existing skips across
four viewports; all 33 actual proxy/container/security tests passed. Production
build, lint and full formatting checks passed. Repeated native General routing
captures show no page errors at 390, 768, 1024 and 1440 pixels, across Orig, John
and Persius. Reviewed `pr630-book-workflows-gallery.png` and
`pr630-library-and-retry-gallery.png` manually; empty synthetic cover placeholders
are fixture data, not failed real artwork. No geometry or stylesheet owner changed.
The preceding native browser run at `8c30e2d4` passed all four isolated shards;
its two workflow-option contract failures are corrected and all 15 relevant
workflow tests now pass locally. A fresh full CI run must qualify the merged
follow-up source before tagging 3.72.28.
