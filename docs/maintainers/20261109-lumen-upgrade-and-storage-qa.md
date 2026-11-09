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


### Opaque scanner identity follow-up

Continued review reproduced another PR630 edge case after its initial integration:
the duplicate-work index lowercased every provider ID, so two opaque IDs differing
only in case shared file evidence. Both ebook and audiobook regression cases
failed against83a9ddd3. Preserve adapter-provided aliases verbatim; only a negotiated
provider adapter may define equivalence. The two negative cases and both original
same-work duplicate ordering cases pass after the repair. This is a backend identity
boundary correction; no visual owner or interface-default policy changes.


All34 scanner tests pass after this follow-up. The compiled production scanner
also ran against a separately cloned task database and read-only provider with
`googlebooks:AbC123` and `googlebooks:abc123`: only the first work has files.
Actual SQL/API readback preserves each record's service links, and headless
Library/detail workflows in both formats at390/1440 show only the owned work in
Library while the missing work retains its Request action. Reviewed
`opaque-identity/opaque-scanner-gallery.png`; existing shared geometry remains
unchanged. The server build and scoped lint/format checks pass.

The E2E app deliberately disables scheduled jobs; the compiled scanner was invoked
as a separate real worker after loading the same settings/runtime config. Early
harness attempts using a nonexistent E2E job and an unloaded worker settings
snapshot are retained as exclusions. These are not application fixes or passing
worker runs. The verified worker additionally asserts its final database evidence
before reporting completion. No provider mutation is allowed.

### Review of incoming PR631–633

Retain the original contribution heads as merge ancestors. PR631's initial
fallback required the ebook category and masked failures: use the existing
format-neutral `/book/search` authorization/language policy instead, permit
fallback only after a successful empty catalogue or server failure, retain Retry,
and project only canonical Open Library works as audiobook candidates. Ebook
manager records are not audiobook ownership evidence. Tests cover audiobook-only
households, 403/429/503, failed fallback and nonempty catalogue behavior.

PR632 reuses the shared Cover/poster/title owners. Missing or failed art receives
an escaped title/author fallback with six stable existing theme-token tints and
the existing display font. Preserve one keyboard/screen-reader art target while
making the equivalent title action clickable. Initial visual comparison caught
that `display:block` disabled the shared one-line title clamp; removed that
competing property and added a long-title geometry regression. Baseline 4e0bc219
and corrected candidate have zero geometry differences over 1px in 24 states:
/books, /audiobooks, /movies at 320/390/768/1440 in dark/light, plus hover captures.
Reviewed `cover-layout-gallery-final.jpg`. Valid art and neighboring content retain
the baseline arrangement. Broken image and malicious-looking literal title cases
are fixtures, with no injected markup. Early incomplete movie fixtures and the
first unclamped candidate remain recorded as exclusions/failures.

PR633's recovery now uses finite keyset batches of 100, exact work/edition and
format-scoped file evidence, request admission and fresh media/service authority
checks after metadata I/O. Cancellation, retargeting, configuration changes,
active search ownership and reused numeric book IDs cannot publish stale
completion. One format does not complete a both-format request. Save complete
entities through existing status/history subscribers. All 45 scanner tests pass,
including 11 recovery cases. All 683 Lumen browser tests pass across four viewports,
with 13 existing skips. Server typecheck and lint pass. Final production and actual
compiled-worker/UI qualification are recorded below when completed.

The separate default-for-all integration roadmap is
[lumen-single-container-remaining-work.md](lumen-single-container-remaining-work.md).
This batch does not silently change upgrade defaults or import companion data.

Final PR631–633 local qualification: production build, server typecheck and lint
pass; generated API-message coverage was refreshed for the scanner source change.
The 34 lifecycle/availability tests and 86 edition/subscriber/notification tests
pass. A separate cloned database and read-only Chaptarr fixture exercised the real
compiled scanner, without mocks: an approved ebook and previously completed
stuck audiobook both acquire AVAILABLE service targets for the exact owned edition.
The approved request queues its durable availability notification. Lifecycle API
readback and actual Lumen Requests display both rows as **In library**, with the
correct Ebook/Audiobook labels at 390/1440. Reviewed
`edition-recovery/requests-gallery.jpg`; no page errors or overflow. Opaque work
identity negative checks also remain green. This is local source qualification;
new merged-head CI and published-image verification remain required before release.


## Native stylesheet lifetime and withheld 3.72.28 candidate

The 3.72.28 tag remains immutable at 95b40d7c. Release run 42687418443
was cancelled before publication after the d5e6995e browser shard 4 failure
exposed a real restoration race. The GitHub release is still a draft with no
published timestamp. Its versioned main image exists for evidence; it is not
the replacement release. 3.72.29 supersedes that candidate and includes PR634.

An obsolete restoration effect removed the pending stylesheet shared with its
current successor. Reattaching the link after load temporarily unloaded CSS,
moving the native save button during a click. A new unit assertion fails on
the original code even though the final link remains connected. A real delayed
catalogue/CSS browser probe reproduced target stylesheet removals in all four
Orig/John × 390/1440 states on the actual 3.72.28 image.

The loader now grants explicit leases, retains shared links while any consumer
owns them, and releases only unused candidates. Switching deactivates a still
owned link without detaching it. A failed restore retains the applied stylesheet
and theme identity together; failed preference saves retain the previous theme.
No dimensions, colours, spacing, or CSS declarations changed.

The 3.72.29 production build passes. The matching delayed-load probe records zero
target removals and constant save-button geometry in all four states: Orig 38px
and John 24px, as specified by the existing shared action geometry. An initial
probe incorrectly assumed every theme should exceed 30px; the check now asserts
each established source-owned size and continuity. The original removal evidence
still fails. Reviewed `theme-lifetime-comparison.jpg`: settled baseline/candidate
layouts match, and Orig and John retain their distinct layouts. Ten isolated
repetitions of the previously failing John/1440 email save/retry/reload case pass.

The first repetition batch overlapped another test process using the same artifact
directory and lost a trace file; that infrastructure-invalid run is retained and
superseded by the isolated ten-pass batch. The first two probe attempts lacked
CSRF bootstrap and returned 403; corrected browser checks retain CSRF protection.
Further settings, delayed catalogue, exact-head CI and shipped-image qualification
are recorded below when completed. Issues #625/#629 remain open until then.

Final local stylesheet milestone: all 64 settings scenarios (16 routes × Orig/John
× 390/1440) are covered by 60 passing first-run cases and all four corrected
category cases. Six delayed-catalogue/stylesheet plus deliberate CSS-order cases
also pass after ending the artificial delay before the deliberate DOM reorder.
The cloned fixture contained an unsupported `magazines` key alongside canonical
`magazine`; strict category validation correctly rejected that hand-edited test
configuration with 400. Removed only that extra fixture key after stopping the
fixture process; no validation rule was relaxed. All ten corrected cases pass.
Theme provider/layout tests pass 12/12, client types, lint, formatting and the
production build pass. Original traces, corrected runs, screenshots and probe
reports remain in the task artifact directory. Exact-head hosted browser and
release-contract validation must still pass before tagging 3.72.29.

The d5e6995e CI run 42687917148 has completed: all backend/native, Vitest,
build/type/lint, tooling, Cypress, ARM64, docs and chart jobs pass. Its sole
failure is the native browser save race described above; final browser CI will
qualify the repair. Lumen run 42687735933 passed on the unchanged bundled source.

## Deterministic image-warm browser qualification

Exact-head 9a6f0386 browser run 42697296958 passed shards 1, 3 and 4,
including the original native settings failure. Shard 2 had one timeout at
`networkidle` in `/discover/movies`' image-warm check: its retained trace shows
movie metadata calls taking over 20 seconds and queued lookups keeping the page
busy; no 429 occurred. The other 158 cases passed, with one existing skip.
Contracts 42697311907 and Lumen 42697252242 passed (683 browser passes, 13 skips;
33 proxy/security tests). This is not a reason to rerun a blind provider-dependent
assertion or publish a failing check.

The warm test now seeds public catalogue/detail/artwork fixtures, waits for a real
visible card instead of global network idleness, and leaves the authenticated
`/api/v1/imageproxy/warm` endpoint and client queue real. It requires nonzero warm
calls, bounded batches, complete 202 responses, no 429 and no page errors. The old
Cypress configuration disabled image caching, so zero calls could satisfy its
upper-bound-only assertion. The browser fixture explicitly enables the client
warm path without changing server settings. Authentication now bootstraps CSRF
and uses the context's actual session cookies, rather than assuming the first
Set-Cookie header is the session. Early local runs exposed that obsolete helper
assumption and are retained as harness failures, not application failures.

The included-Lumen guide also now diagrams the normal single-container 5055 path
first and describes its actual presentation/branding controls. The independent
5080 companion is shown separately; its settings are not implicitly imported.
Application source is unchanged from 9a6f0386 by this test/documentation milestone.

All three corrected warm-page cases pass with CSRF enabled, both with the source
fixture's image cache enabled and with server caching disabled as in CI. The
latter still makes nonzero real warm requests and requires 202 responses, proving
the check is no longer vacuous. Formatting and lint pass. The next exact-head
browser run supersedes the old provider-idle failure; production source remains
byte-for-byte identical to the qualified 9a6f0386 application.

## Concurrent security integration and narrator UI qualification

GitHub main advanced to f6e9cffb2 while the deterministic browser milestone was
being pushed. Preserved that security history and cb0b3ad34 through merge
1fb0ae8a5 on both remotes; no history was rewritten. Full CI 42702222464 qualifies
the combined security/backend source. Earlier 9a6f0386 backend receipts cannot
qualify those new authentication/session/deployment changes. The security commit's
focused server/browser and Android/iOS compilation checks passed independently.

Rendered the actual `/series/QA-Narrator` page with bounded series/narrator
metadata fixtures, real account permissions, real theme loading and real API
mutation guards. Baseline uses the retained 3.72.28 image; candidate uses the
combined production build. Eight normal states per source cover administrator
and advanced-request-only accounts in Orig/John at 390/1440. Managers retain the
collection button; advanced-only candidate accounts do not see it, and all four
real mutation probes return 403. Candidate and baseline panel geometry match.
Click trials after ordinary scrolling prove controls are usable above the mobile
navigation; no provider mutation is sent. Four failed-load states per source
also expose Retry and preserve the complete accessible heading. All 24 matched
captures pass without page errors or document overflow.

The phone baseline exposed bare text inside an inline-flex `page-heading`, which
clipped the long narrator label mid-word. Both normal/error headings now reuse
the existing child-span truncation owner. No CSS or dimensions change. Reviewed
`narrator-heading-final-comparison.jpg` and the failed-load captures. The two
existing edition comparison tests, lint, types and webpack production build pass.
An initial direct Next command selected Turbopack and rejected the shared dependency
symlink; the project's webpack invocation passes. Initial harness attempts with
an omitted username, pre-ready connection, and incomplete accessible-name match
are retained separately and excluded from acceptance. Synthetic role changes
were restored after each run. Native origin-bar visual verification remains
separate from this web UI acceptance.

## Combined-build metadata and offline recovery

Combined CI 42702222464 completed with successful native TypeScript, all four
Vitest shards, lint/types/build, tooling, Cypress, ARM64, docs and chart jobs.
Three browser failures exposed additional integration problems before publication:
TV's bounded server metadata request could reject into a Next 500; the strict
security CSP blocked the offline document's inline recovery script; and the warm
test still depended on optional caption visibility and unseeded Discover shelves.

A controlled server-side 503 reproduces the original whole-page 500 in all eight
movie/TV × Orig/John × 390/1440 cases. Metadata hydration is now optional, using
existing authenticated client recovery. Movie gets the existing shared Retry
message owner. Both pages synchronize watchlist state when metadata arrives;
failed movie mutations no longer invert visible state in `finally`. Explicit
401/403/404 states take priority over cached data. Internal URL encoding,
timeouts and cookie forwarding remain bounded; Axios request configuration is
not serialized into Next's error path. Eighteen unit cases cover successful
hydration, seven failure classes and invalid scalar IDs on each page.

The offline document now uses an external same-origin script. A versioned
installation cache atomically retains its HTML and script, and serves the script
offline without changing account-partitioned API caching. Focused SSR, offline
and service-worker tests pass (49). The production build passes all prebuild
contracts, translations, types and compilation.

A real built server with CSRF enabled passes all 42 focused browser cases:
32 metadata recovery/watchlist/access cases, three real warm-endpoint cases,
three actual service-worker navigation/offline/reconnection cases and four stale
library recovery cases. Native metadata cases cover Orig/John at 390/1440. Only
bounded provider metadata and watchlist writes are fixtures; no household
providers are mutated. The warm endpoint remains real and must receive nonzero
bounded batches with 202 responses, no 429 or page errors.

The first focused run's nine failures are retained and excluded: exact title
matching omitted the displayed year, the seeded administrator was a Plex account
whose watchlist controls are intentionally absent, and a built-in Discover shelf
was not seeded. Tests now select the complete heading, explicitly represent a
local-account watchlist, and seed the remaining public video shelves. The
original application 500 and CSP failures remain independently demonstrated;
these harness corrections do not weaken their assertions.

The concurrent request/subscription contribution e6ee2a1bd is preserved in merge
cda4bf4c8 on both remotes. Its five focused request, user, notification and
migration suites pass (406 tests). The first combined prebuild caught omitted
generated API messages from that contribution. Regenerated the source callsite
manifest, six English defaults and source fingerprints; the full combined
production build then passes. This requires fresh combined-source hosted checks;
the earlier successful backend run does not qualify new backend code.
