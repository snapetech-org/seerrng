# Interface Integration Checkpoint

This is the living evidence appendix for the forward-merge guide, not a release
approval or a complete site-audit claim. Read the UI Style Standard and UI Fix-It
first. Preserve earlier accepted work while reviewing small batches.
Never infer visual inspection or live-provider evidence from test success or a
journal's implementation note. Historical statements below that a human or visual
review was pending record the evidence state at that checkpoint; they do not create
a second approval gate after the maintainer explicitly directs merge or release.
This appendix is chronological evidence. Only the latest dated entry describes
current status; no older imperative, command binding, or pending gate controls
current work. Normative procedure lives in the UI guides, `CONTRIBUTING.md`, and
`tools/validation-engine/README.md`.

## Current maintainer direction — October 6, 2026

The project owner explicitly removed human review/acceptance as a merge or
release gate. Record visual inspection separately from automated evidence, but
do not block authorized merges or releases waiting for owner sign-off. Earlier
checkpoint entries preserve the status at the time they were written and do not
override this current direction. Continue to require the applicable automated
checks and report their actual results.

## Preservation and coverage map

| Work to preserve                                                       | Established owners and existing checks                                                                                                                                                                            | Review boundary                                                                                                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request Status and request-modal layout, filters, actions, title roles | `globals.css`, Request components; `src/styles/buttonGeometry.test.mjs`, `requestLayout.test.mjs`, current-batch contract                                                                                         | Earlier work is in scope for the contribution; a Series-first batch does not remove it. Final accepted references and current narrow renders remain to be assembled. |
| Shared page titles/headings, typography and spacing                    | `page-title`, `page-heading`, card/table families; `buttonGeometry.test.mjs`, current-batch contract                                                                                                              | Preserve role owners and existing acceptance, not retired experimental values.                                                                                       |
| Aggregate loading/searching/mutation status                            | `page-title-row`, `page-status`, shared status/spinner; `buttonGeometry.test.mjs` and component tests                                                                                                             | Keep one real activity indicator; completion/unmount must clear contributions.                                                                                       |
| Poster dimensions, buttons, media slots and hover                      | `poster-layout`, poster frame/region/control roles; `buttonGeometry.test.mjs`, `iconOnlyButtons.test.mjs`                                                                                                         | Fixed browsing geometry is distinct from detail/credit posters. Trace all affected renderers.                                                                        |
| Series tree, quality, native controls and disclosure ordering          | Series components, shared selection/tree/ratings/disclosure owners; `seriesDetailsStyle.test.mjs`, native-action suites and reorder suites                                                                        | Selection and permissions remain functional contracts. Mocked drag tests do not prove physical drag/touch acceptance.                                                |
| Current Plex Collection repair                                         | `server/api/plexapi.ts`, native collection routes/client; `server/api/plexCollections.test.ts`, `src/styles/mediaServerCollectionsClient.test.mjs`, `mediaServerCollections.test.mjs`, `plexCollections.test.mjs` | Optional smart marker is accepted only with remaining exact identity checks. Remove only membership, never the collection.                                           |
| Mutable Watchlist/Collection state                                     | `server/middleware/apiResponseCache.ts`, native clients, `ServiceWorkerSetup/sw.ts`; cache/client/service-worker tests                                                                                            | Fresh initial/pre-write reads and confirmed desired state; local Seerr watchlist and Plex Watchlist remain distinct.                                                 |
| Dropdown opacity, overflow and ancestor framing                        | Shared dropdown/menu surface and detail-card open state; `seriesDetailsStyle.test.mjs`, `Common/Dropdown/playbackStyle.test.tsx`                                                                                  | Parsed source ownership is not rendered paint-order proof. Compare open and closed desktop/narrow states.                                                            |

The broader [Interface Preservation Inventory](interface-preservation-inventory.md)
has been reconciled against the journal and original chat. It covers the Request
page and shared roles, poster/browse prototypes, dropdown/mosaic cleanup, final
tree/table/workspace, ratings, ordering and native actions. It distinguishes
explicit acceptance, pending review, retired trials and opt-in references.
Neither document replaces the final three-way changed-file inventory. Rolled-back
successor changes must not be resurrected because an older log mentions them.

## Confirmed provider evidence before this batch

- Plex Collections: authorized Seerr Add, Remove and Add again with matching
  provider and Seerr membership readback. The test collection was retained for
  John's manual trial, not deleted. This was a bounded own-account verification.
- Plex Watchlist: the stale mismatch was reproduced; authorized removal of the
  reported series reduced membership by one and a fresh Plex reload confirmed
  absence. Adding it back restored membership and the Remove action. The item
  remains saved. This is live evidence, separate from mocks.
- Jellyfin/Emby native actions: mocked tests only; no live write pass claimed.
- Previous focused passes do not establish a full cumulative suite/build pass.
  Human visual acceptance and physical drag/touch review remain pending.

## Current bounded batch

Approved: improve portable instructions, regression checks and merge evidence;
repair only clear existing visual-rule violations in the Series/shared controls.
Not approved: broad backend/security repair, new design presets, NAS deployment,
GitHub push/PR or production-account tests as part of a visual audit.

The original public `dev`, `build`, validation and hook bindings remain intact.
Focused checks support iterative previews; finalization requires one complete
gate on the exact candidate. `pnpm build` runs validation then compilation, so
do not run another identical full validation immediately beforehand.

Known remaining visual debt: legacy Series/shared `@apply` and competing card
padding owners require a later bounded consumer audit. A long action-menu list
needs an approved bounded-viewport preset; do not invent dimensions here. This
batch does not establish that the page or application is Tailwind-free.

Current isolated focused batch: **117 tests passed**, zero failures, skips,
cancellations or todos. Suites: local-validation bindings/discovery/isolation,
buttonGeometry, iconOnlyButtons, requestLayout, Series style and saved-item
client. New negative fixtures reject competing clipping/surface/gap owners and
retired icon geometry; Watchlist Remove tests confirm explicit desired false
and fresh already-completed state. Two old icon assertions were superseded by
the documented shared-padding/native poster-role contract, not waived.

Isolation: separate candidate source, disposable `/tmp` config, Docker network
mode `none`, dependencies/store mounted read-only; no live config/DB mount.
Formatting and discovery plan passed. All 12 explicit files matched the mounted
source readback. Desktop/narrow menu inspection confirmed the shared black surface,
open content above its parent frame, keyboard access to the last option, and Escape
restoring normal clipping/layers/focus. Narrow tree headings still crowd; physical
drag/touch and final human visual acceptance remain pending.

The one full `pnpm build` attempt passed translations, current-batch and shared-
style validators, formatting, lint, server/client types and all 85 Vitest files
(395 tests). **Blocked:** during the native TypeScript lane, the network guard
failed after AvailabilitySync because of an unstubbed TMDB attempt. The related
test, implementation and guard match the pre-batch source. This is an unchanged
test-isolation failure, not proof of a production backend defect.

The isolated run was stopped after that required failure. Native TS is incomplete;
the cumulative native JS/tooling lanes and production compilation were not run.
No complete gate/build pass, exception or waived failure is claimed. No unrelated
backend/test repair was made in that attempt. Preserve the failed receipt
separately from focused passing evidence.

John subsequently authorized repairing that suite's test isolation with production
backend code untouched. The focused failure was reproduced with the guard enabled;
the test now mocks the actual retained TMDB client with typed season fixtures and
per-test restoration. Unexpected fixture IDs fail outside the production catch.
A new unavailable-enrichment case checks the exact lookup and preserved status.
All 18 focused tests pass, with no skips/cancellations/todos. This test-only repair
is not a production backend fix or a complete cumulative gate/build pass. The
The final gate and human acceptance were pending at that checkpoint; unrelated
failures required scoped direction for that attempt. On 2026-10-06, explicit
user authorization covered fixing failures that block the requested
software-acquisition validation and release, superseding that pause for this
work. The 2026-10-07 direction removes human acceptance as a merge or release
gate.

The visual/client fixtures were also tightened: negative CSS/role fixtures must
fail with their intended diagnostics, wrong icon padding is checked without a
duplicate declaration, and Watchlist Remove rejects a valid response that still
reports saved membership. Recovery remains read-only. The six focused visual/
client/runner suites now pass **119 tests**, zero failures/skips/cancellations/
todos; the separate AvailabilitySync focused suite passes 18. Production backend,
network guard, package/hook bindings and lockfile remain unchanged. The complete
candidate is being verified separately; these focused receipts are not a waiver
or full-gate claim. Internal-only test hardening adds no user-facing feature.

## Subsequent isolated verification and input blockers

The repaired cumulative retry passed the preliminary validators, formatting,
lint, server/client types and all85 Vitest files/395 tests. AvailabilitySync
passed within the native TS lane. A different required after-hook then failed
following the Plex scanner suites: the guard caught an attempted request to a
fake Plex test host. That scanner source and guard are unchanged from the
preserved baseline. This is isolation evidence, not a production bug diagnosis.
The long run was stopped there; exit137 records the stop, separately from the
hook failure. Native TS remains partial; no production compilation was reached.
No scanner/guard repair or failure waiver was made.

The previously unrun native JavaScript lane was executed separately on the same
frozen candidate: all46 selected files ran,391 tests,357 passed,34 failed, zero
skips/todos/cancellations. This is a failing partial receipt, not a complete gate.
Failures include superseded source/utility assertions and unresolved contracts;
replace only clearly superseded assertions with equivalent role/behavior tests
and negative fixtures. Do not restore retired layouts or normalize uncertain
palette/ordering decisions merely to increase the pass count.

Full tooling inputs are also unavailable: the mounted app source contains only
the CI workflow, while tests read other chart/release/preview workflows and root
release fixtures. The bare Node/Alpine image lacks required native tools.
The earlier snapshot additionally omitted an existing Unraid template fixture;
that omission is corrected in future manifests, not inserted into the frozen
receipt. Establish complete authoritative pinned Git inputs and a suitable
disposable toolchain before another final run. Plan discovery is not proof of
fixture/tool availability. No borrowed fixtures, installed live tools or suite
exclusions convert these blockers into a pass.

## Bounded visual-contract follow-up

One established implementation violation was repaired: the single-option
Request icon's local16px utility is removed only after its real branch is
attached to the existing shared14px content-size owner. No new geometry or
palette was designed, and production backend code is unchanged.

Seven visual test files now follow the current Requests consumer, accepted
semantic table/gap owners and Series saved-order/controlled-disclosure behavior.
Superseded source/utility assertions were replaced with property/role/callback
coverage and diagnostic-specific negative fixtures. The affected nine-suite
execution (including shared button/icon checks) ran157 tests:153 passed, four
failed, no skips/todos/cancellations. Three failures were in the new icon checker:
it initially audited unrelated root palette aliases and mishandled PostCSS's
separate important flag. After correcting that checker, only its changed six
tests were rerun: all six pass. The other required Book ordering failure is
unchanged and unresolved; no full affected or cumulative pass is claimed.

Current-batch/shared-style validators and changed-component lint pass;
formatting passes. The actual PostCSS configuration compiles the shared CSS
with zero warnings. Palette/theme, Book-order and other unreconciled failures
remain recorded. The earlier frozen full/native-JS receipts are retained;
this follow-up was recorded with focused evidence and without rendered review.
Repository/toolchain prerequisites and the full gate/build remained blocked at
that historical checkpoint; it is not an ongoing human-review gate.

## Latest bounded preview checkpoint — October 2, 2026

This section supersedes earlier current-status descriptions above, not their
preserved diagnostic receipts. John limits further preview verification to the
Requests page, Series page, Discover's Recent Requests slider, and shared poster
styles across their consumers. A poster-role check does not authorize a whole-page
audit of each consumer. No broad backend repair or site-wide page sweep is approved.

The two inherited network-isolation failures also reproduce on untouched upstream
v3.44.1 and the subsequently tested main. They do not establish that the visual
changes introduced a production defect. Original tests and failed receipts are
backed up. John's exact-file/target temporary diagnostic deferrals are opt-in;
outbound requests remain blocked and strict default behavior remains intact.
Deferred required failures are not a passing release gate. Reconcile the original
tests and the maintainer's coverage before final contribution acceptance.

The retired CSS-representation assertions have been reconciled with the current
shared classes, variables and accepted semantic roles, retaining meaningful
behavioral safeguards and negative coverage. That source lane passed 410 tests
in 47 files, with no failures or skips. The previously completed component lane
passed 395 tests. These are separate receipts from an earlier exact source state,
not a complete cumulative pass for the final tree. The three broad native
receipt-recovery partitions were intentionally stopped when John narrowed scope;
their partial reports must not be counted as passing or restarted automatically.
Unrelated tooling findings remain documented rather than repaired or waived.

A subsequent narrow cleanup removes competing card-padding ownership: main media
cards retain the existing shared main-padding owner rather than also consuming
inset padding. The overwritten local padding utility and duplicate blur declarations
were removed. The shared poster layout retains positioning while the shell retains
only its independent stacking role. Current main/inset padding remains 8px;
browsing posters remain 169.2px wide with a 2:3 frame. No component, production
backend, dependency, live configuration or provider data changed in this cleanup.

Current focused receipts, executed once per final affected selection:

1. Seven card/poster owner and menu checks passed, including negative mutation
   checks (`mediaCardOwners.test.mjs` and the two selected menu contracts).
2. Thirteen native frontend poster badge/link and slider tests passed in three
   files: `TitleCard/statusBadges.test.ts`, `TitleCard/bookDetailQuery.test.ts`,
   and `utils/mediaSlider.test.ts`.
3. Nine native frontend Requests user-filter and Series availability-tone tests
   passed in `Requests/requestStatusQuery.test.ts` and
   `MediaDetails/AvailabilityValue.test.ts`.

Those 29 tests have zero failures, skips, cancellations or todos. Native runs used
isolated source/config, read-only dependencies, no network, strict network guards,
and no temporary network-deferral flag. Formatting passed. Published CSS/test
readback matched the tested files; the complete source comparison found no
unexpected component/backend changes or deletions.

Rendered review confirms Requests at 1440px and 390px, Series at the existing
desktop-sized viewport and 390px, and the request slider at 390px. Requests uses
36px/40px page-title typography above the breakpoint and 24px/28px below it;
cards retain 8px padding. Neither reviewed narrow page has page-wide horizontal
overflow. Poster positioning and frame dimensions remain intact. The desktop
collection-menu capture shows an opaque black surface extending beyond the main
card without clipping; Escape closes it. Request-slider Next moved the track by
one compact-card width, and Previous restored its disabled-at-start state.
The landscape request-summary cards are not portrait browsing posters.

Legacy compact request-card utilities and remaining shared `@apply` are explicitly
not a Tailwind-free claim. Loading/error/empty variants, every alternate theme,
physical drag/touch, and unaudited pages are not newly certified by these captures.
No live provider mutation was repeated during this visual cleanup. Detailed source
hashes, receipts, recovery files and screenshot locations are in the recovery
journal.

John explicitly accepted the visual test for this scoped cleanup on October 2,
2026, while on his phone, based on the previously proven CSS and absence of major
visual changes beyond utility/duplicate-owner cleanup. This is his approval of
the current bounded visual batch, not a claim that he newly inspected every
desktop/narrow screenshot or certified unreviewed themes, states or pages.
Earlier review gaps above remain recorded; this approval does not silently
certify physical drag/touch or other untested interactions.

The complete strict gate/build, GitHub checks and publication authorization
remain pending. Visual acceptance does not waive deferred required test failures
or authorize a PR. CI success must be matched to the actual shared-gate inventory,
not assumed to cover every local check.

## Finalization authority and latest accepted scope — October 3, 2026

John explicitly accepted the current preview and authorized final checks, a
contribution to `snapetech/seerrng`, monitoring relevant CI failures, deployment
of the tested preview build to his server, and bounded nightly cleanup. These
instructions supersede the earlier pending publication/deployment authority;
they do not waive a required failure or authorize unrelated backend repairs.

The accepted candidate now uses the newer upstream 3.46.1 main at
`e7305281797cd7527c3b1c0a83ff144218ad506a`. Later accepted work includes shared
blue pinnable catalog filters and titles, the yellow watchlist visibility action,
the reused Series request tree and adjacent Episode Queue, a single Series
request entry, six-role Overview disclosure/order, and native shared CSS cleanup
for active Series detail/request/browse controls. The latest focused receipts
are not the cumulative release gate. Remaining utility-dependent conditional
overlays, settings-specific controls, physical drag/touch, and unaudited pages
are not newly certified or claimed Tailwind-free.

Final independent review identified an API-contract mismatch: Overview expanded
the Series role set to six while the OpenAPI order schema still described five.
The schema must match the same six-role server owner before final validation,
including persisted user settings, request payloads and normalized responses.

Publication must also follow the current contribution guide's requirement that
John supplies his own-word PR description and accurate AI disclosure. Automated
code/testing evidence does not supply that human-authored publication input.
If that input is absent, preserve the contribution on a verified remote branch
and report publication as pending rather than misrepresent authorship.

## Required evidence at contributor finalization and maintainer integration

Fill these fields with observed facts; unknown means pending, never assumed.

1. Contributor remote/branch/commit; pinned maintainer target remote/branch/commit;
   actual common ancestor; integrated commit; exact tested commit/source digest.
   All commit IDs are pending until the actual authorized Git integration.
2. Pinned Node/pnpm identities, lockfile SHA-256, environment/platform, isolated
   source/config/dependency mounts and actual network boundary.
3. Three-way changed-file inventory and conflict ledger: owner, newer upstream
   behavior/security requirements, preserved interface rule, resolution and check.
   Do not wholesale restore an older backend, component or lockfile.
4. Discovery plan versus executed logs: test file inventory, test totals, failures,
   skips/todos, platform exclusions, lint/type/static/style results and build result.
   `pnpm test` and `pnpm test:ci` are Vitest-only; neither is the complete engine.
   Browser suites belong to the applicable engine or workflow path. Linux is
   required for complete POSIX tooling coverage.
5. When UI changed or visual evidence is otherwise applicable, retain
   desktop/narrow reference locations and observed evidence per page/state,
   including loading/error/empty, keyboard/focus/disabled, open menus and reorder.
   An automated screenshot or computed-style result is not visual inspection.
6. Live Plex evidence separately from mocked native coverage; safe prerequisites
   for unverified providers. Never copy credentials, runtime DBs or live config.
7. Explicit deferrals, unresolved failures and next gate. A failed required gate
   blocks finalization. Keep a narrow visual task from expanding into unrelated
   backend work unless the user explicitly authorized broader remediation or a
   complete gate; that authorization covers the repairs needed to pass it.
8. Recoverable refs/archive identity and checksums, final source readback, and
   applicable publication authority. Local preview publication is not PR approval.

The contributor and Keith's AI must use the same checked-in instructions and
gate, adapted to the newer target without discarding its valid security/backend
fixes. If the target advances, pin the new head and repeat invalidated checks.

## Preview merge and validation — October 4, 2026

This section supersedes earlier descriptions of the current command bindings and
publication authority; historical receipts above remain unchanged. John selected
the accepted preview and authorized integration with Keith's current main,
scoped Fix-it repairs, source-specific engine validation, separate guarded
compilation, and a laptop preview on port 5071 with an independent copy of the
5070 configuration/database. The final preview is shown only after those checks
complete. Visual inspection was pending at that historical checkpoint; the
user's 2026-10-07 direction supersedes it as a PR or release gate.

The pinned upstream base is `a96fafa07c77a2d6d95badeb9f60c32a6b4a47c9`
(3.48.3). The exact accepted working-byte checkpoint is
`d9338138acf269a37018d2fedc7b7daa8dce2d2d`, whose common ancestor with upstream
is `e7305281797cd7527c3b1c0a83ff144218ad506a`. The three-way inventory contains
311 accepted paths and 361 upstream paths, 308 overlapping paths, and eight
manual conflicts. The accepted screen semantics are already present upstream;
MediaSlider retains its newer TMDB stale/error retry notice and poster fallback.
Testing instructions are reconciled to the reviewed engine, while actual public
package commands and hooks preserve their existing bindings.

The reviewed combined engine uses this integrated candidate's existing tests and
supplemental checks with fresh inventory, case ledger and source/environment
pins. The archived comprehensive runner is not an additional mandatory test run.
`pnpm build` runs translation/shared-visual guards and compilation separately.
The saved 3.48.1 engine receipt remains historical and cannot certify this source.
All iterative source, dependencies, evidence, caches, test and compile work remain
in Docker-managed Linux storage. The original accepted preview remains preserved.

Current evidence and the bounded Fix-it repair ledger are being recorded in the
owned Linux evidence volume. Final tests, compile, deployment health and visual
acceptance remain pending until their actual receipts are verified. No live
provider writes are authorized by this validation.

## Theme adoption and publication authority — October 4, 2026

John subsequently requested a one-time switch to SeerrNG for new installations
and existing accounts upgrading to this build or a later build containing this
migration. The stable migration adds an account palette default and clears old
active advanced-theme overrides once. After login, another supported palette
can be selected and saved to that account. Later logins and upgrades retain that
choice; the migration is not a per-version or per-login reset. Appearance mode
and unrelated account preferences are preserved.

John explicitly authorized submission to `snapetech/seerrng` after passing tests,
using his previously approved AI disclosure, and automatic follow-up repairs
for relevant PR failures. This supersedes the earlier pending preview-review
publication gate. It does not certify new physical drag/touch, browser/Cypress,
live-provider or PostgreSQL-service testing. The accepted visual decisions remain
his; no new whole-site visual acceptance is claimed.

The pre-theme integrated tree passed the full reviewed engine (3,994 passed,
four existing conditional PostgreSQL skips, zero failures; 555 files) in
344.227 seconds. Its separate guarded compilation completed in 117.572 seconds,
after 11.150 seconds of prebuild guards. Those are historical receipts for tree
`473af0fd9c7479c9e58c043115e285727691ccd7`, not proof for the theme amendment.
John explicitly waived another compile and requested tests only for the amended
source. A fresh source-bound engine run and static checks must establish that
amendment's actual result before publication. No production deployment or merge
of Keith's PR is authorized by this overnight finalization request.

## Expanded SeerrNG feature candidate — October 4, 2026

The current task supersedes the older bounded-scope publication status above
for this contribution: the user explicitly requested implementation of game
library and household play tracking, repair of the other existing dirty work,
the complete validation gate and build, commits, a push, and a release. The
older records remain historical evidence for their original source trees.

- Candidate: `/tmp/seerrng-reader-groupings`, branch
  `codex/reader-groupings-20261004`, initially based on
  `06fbbce72260a08f36139af5dcd94dcda0bd481f`. Final validation found that
  `origin/main` had advanced through the v3.51.0 release; the current candidate
  is now fast-forwarded through `f32232a58972e70e7d7862ef3199e3a33b662c50`.
  The candidate retains the Audiobookshelf/ChaptarrNG integration at
  `e9d2e50f2b446a70e01f5b16af8bc8265ed99b3e` in its ancestry.
- Recovery: source snapshot `/tmp/seerrng-pre-game-20261004`; original recovery
  stash `3b4e8dfbf9dbc20b1fc444650c3243f9b37a4d5f`; integration checkpoints
  `527b16ec5367eeaf122705bc61d086bfdd9016ad` and
  `d3344bed33786af95d5b4b4a3003e604aea8265c` remain available. No stash or
  recovery ref has been dropped.
- Current work includes private per-user game libraries, Steam account linking
  and import, progress and opt-in household sharing, the Play Together overlap
  view, and software-request links; Grimmory/BookOrbit delivery and managed
  reader shelves; per-user external request lists; software catalog fallback;
  and the request-count refresh repair. Earlier Request Status, shared heading,
  layout, poster, and control work in the integrated tree is retained.
- Reader shelf settings now use the shared `SettingsField` checkbox adapter;
  reader service settings, managed shelf API paths and response shapes are
  documented in `seerr-api.yml`. Mock-backed client/route coverage and migration
  coverage are included. No provider was contacted live.
- Latest completed UI batch evidence: current-batch contract 567 files passed;
  shared stylesheet audit inspected 395/395 components; button geometry 68/68
  passed. A focused reader provider/route run passed 17/17 before adding the
  remote-shelf recovery regression; that updated selection still needs to run.
  Server and client type checks passed before the latest checkbox-adapter edit;
  rerun on the final source.
- Before the current-main forward integration, the final-gate plan selected 97
  Vitest files, 384 native TypeScript files, 56 native JavaScript files and 32
  tooling files (569 total, zero declared platform exclusions). That inventory
  is historical; the integrated tree has a fresh plan below.
- Prerequisites were checked against the complete non-shallow Git checkout:
  Node.js 24.15.0, pnpm 10.24.0, Git 2.55.0, Python 3.14.7, SQLite 3.53.4,
  PostgreSQL client 18.6, installed dependencies, all 29 GitHub workflow files,
  and the selected deployment test fixtures. The frozen lockfile install already
  completed successfully in this isolated candidate.
- The exact final `pnpm validate:development` run, one production build, browser
  run, screenshots, release-note preview, commits and remote push are pending.
  human visual review of the new game and reader surfaces was listed as a
  release gate in this historical checkpoint. The user's 2026-10-07 instruction
  supersedes that requirement; no human review is required for this repository.
- No task commit, push, tag, draft/published release, merge, or deployment had
  occurred at that checkpoint. The user later authorized merging and releasing
  this work; current automated checks are recorded on the corresponding PR.

## Complete dirty-worktree inclusion — October 4, 2026

The user reaffirmed that every distinct dirty and unrelated change must be
included. The candidate inventory covered all registered repository
worktrees, all dirty and staged paths, and saved worktree stashes. It now
contains the reader shelves, Grimmory/BookOrbit delivery, household game
library, external request lists, software catalog fallback, request-count
repair, donation-link update, Audiobookshelf scan hardening, request-edit
identity repair, and the discover OpenAPI regression test. Each feature remains
separately attributable in its release fragment and integration record.

The Audiobookshelf scan hardening was recovered from preserved stash
`d377f690ddda68b0d15bf4bb8ef9a246e51b31bc`. A complete candidate snapshot
before that consolidation remains as stash
`057219485a063805eea0aabf4f1a0ef652842e6c`; no source worktree or stash was
dropped. The original Cypress-prep, magazine, failed-download, Questarr-help,
and request-count changes had already reached the candidate, so their duplicate
dirty snapshots were not copied twice.

The unique added focused checks pass: Audiobookshelf scan helper/scanner/API
and discover contract **12/12 Node tests**; RequestBlock edit identity
**2/2 Vitest tests**; server/client TypeScript, focused ESLint, i18n and
formatting also pass. Full cumulative validation and a production build remain
pending on this expanded candidate. Rendered desktop/narrow inspection and
John's visual acceptance were recorded as pending then; neither is a current
release gate under the user's 2026-10-07 direction.

## Current main integration and gate follow-up — October 4, 2026

The candidate initially started at `06fbbce72260a08f36139af5dcd94dcda0bd481f`
while `origin/main` had advanced to `f32232a58972e70e7d7862ef3199e3a33b662c50`
through the v3.51.0 release. The first complete validation run correctly failed
`scripts/check-changelog-tags.mjs` because the stale source lacked the v3.51.0
changelog section. It was not a candidate feature defect. Before integration,
the entire dirty and untracked candidate was saved in recovery stash
`55bb13aa1a5f5a988457919ed8a5433fab5519bf`; no recovery stash was dropped.

The branch fast-forwarded to current `origin/main`, then the saved changes were
restored with `git stash apply --index`. Two overlaps were resolved by retaining
both sides: `src/components/SoftwareCatalog/index.tsx` keeps upstream QuestarrNG
ownership and play-time estimates alongside the private My Games actions, and
`src/i18n/locale/en.json` keeps both upstream and game-library messages. The
release-tag check now covers all 141 SeerrNG tags. The fresh development plan
selects 99 Vitest files, 385 native TypeScript files, 56 native JavaScript files
and 32 tooling files (572 total), with zero declared platform exclusions.

The prior stale-source cumulative run completed all selected lanes but failed
one tooling test: `scripts/release-notes.test.mjs` could not find the 3.51.0
changelog section. This receipt is invalidated by the forward integration; the
complete gate must be rerun against this exact merged tree. The production build
has not run. The in-app browser control and isolated workspace controls are not
available in this session; rendered review is pending on an available local
browser path. Human visual review of the new game and reader surfaces was
recorded as pending at this checkpoint; the user's 2026-10-07 direction removes
it as a release gate.

## UI correction and verification record — October 5, 2026

The first production screenshot review found that GameLibrary rendered a second
`main.page-layout` inside the shared application page shell. Removed the nested
shell so the page uses the shared content width and applies the fixed-search-bar
offset once. No global styles or unrelated page owners changed. The Cypress
flow now checks horizontal bounds at 1280px desktop and 390px mobile, with
element diagnostics on failure.

- The complete v3.51 integrated-tree gate passed before the page-shell and
  Cypress diagnostic correction: 99 Vitest files/452 tests; 385 Node TypeScript
  files/2,912 discovered (2,908 active); 56 Node JavaScript files/485 tests;
  and 32 tooling files/238 tests. Four PostgreSQL-only migration cases were
  skipped because PostgreSQL was not configured. The prior log is
  `/tmp/seerrng-game-library-validation-v351-integrated-20261004.log`; its pass
  is historical, not final-candidate evidence.
- Production builds passed both before and after the page-shell correction;
  the post-correction build log is
  `/tmp/seerrng-game-library-build-post-layout-fix-20261004.log`.
- Against the built candidate and disposable SQLite configuration, the game
  library Cypress flow passed 1/1 in Chromium at 1280px desktop and 390px
  mobile. The reader settings flow passed 1/1 in Chromium after it was rerun
  alone with the server lifecycle tied to its test command. These were mocked
  local-provider checks; no external provider was contacted.
- A combined multi-spec Cypress invocation passed the game flow but navigated
  the reader spec to the cached `/offline.html` fallback while the disposable
  server remained healthy. Both specs passed in separate fresh Chromium
  processes against the same build and database. This cross-spec service-worker
  behavior is recorded separately from product-provider integration.
- Final screenshot inspection found the new ownership/sharing captions were
  using browser-default black text. Added the scoped
  `.game-library-sharing-label` role in `src/styles/globals.css`, applied it in
  GameLibrary, and added a computed-color browser assertion. The first
  incremental build artifact did not include the new rule. A clean build from
  the exact source emitted it, and the browser assertion now verifies the
  rendered caption color.
- The rebuilt reader settings screenshot exposed cramped side-by-side service
  cards and narrow generated-address controls. Reader service and shelf cards
  now use one column; each generated address fills its row, with its copy action
  below it. The Cypress flow checks card order, address width, and action bounds
  at desktop and mobile sizes.
- A clean production build passed with the tracked source changes applied to a
  detached build worktree. It generated `/games`, `/settings/services`, and
  `/qa-request-edit`; CSS includes the game caption and reader layout roles.
  Log: `/tmp/seerrng-reader-settings-layout-build-20261005.log`.
- The Game Library browser flow passed **1/1** in Chromium 153 against that
  build at 1280×900 and 390×844 CSS viewports. It covers manual ownership,
  household sharing, Play Together, and horizontal bounds. The reader settings
  flow passed **1/1** at the same viewports, covering saved URLs, preference,
  generated links, service-card width, and non-overlapping copy actions. Logs:
  `/tmp/seerrng-final-ui-game-cypress-20261005.log` and
  `/tmp/seerrng-final-ui-reader-cypress-20261005.log`.
- Desktop and mobile rendered-content captures are at
  `/tmp/seerrng-game-library-final-review-20261005/` and
  `/tmp/seerrng-reader-settings-final-review-20261005/`. They record the
  automated rendered-content check; separate human review is not required under
  the user's 2026-10-07 instruction. The first exact-tree gate attempt
  stopped during formatting before any test lane, reporting ENOENT for
  temporary locale `.bak` paths. A subsequent isolated sequential
  `pnpm i18n:check` and `pnpm format:check` passed. The first output is preserved
  at `/tmp/seerrng-game-library-validation-format-failure-20261005.log`. The
  complete exact-tree `pnpm validate:development` run follows this ledger
  update before the UI-fix commit; its receipt is
  `/tmp/seerrng-game-library-validation-final-candidate-20261005.log`.
- Tests used a fresh disposable SQLite configuration and local providers only.
  No live Grimmory, BookOrbit, Steam, QuestarrNG, or ROMarrNG provider was
  contacted. Human visual review was recorded as pending then; it is not a
  release gate under the user's 2026-10-07 direction.

## Rebuilt candidate and rendered review — October 4, 2026 (Regina local)

The follow-up screenshot review found `GameLibrary` rendering a second
`main.page-layout` inside the shared application page shell. The page now uses
the shared shell once, preserving the fixed search-header offset without a
second page-width wrapper. The change stays within the GameLibrary consumer;
no shared CSS or unrelated page owners changed. The built server and app were
rebuilt after this correction.

- `pnpm build` passed on the corrected application source and generated the
  `/games`, `/settings/services`, and `/qa-request-edit` routes. Log:
  `/tmp/seerrng-production-build-final-20261005.log`.
- Game-library Cypress flow passed **1/1** after the rebuild at 1280×900 and
  390×844 CSS viewports. It exercises manual ownership, sharing and the
  household overlap view; visible bounds and document/body widths are checked.
- Reader settings Cypress flow passed **1/1** after the rebuild at 1280×900 and
  390×844 CSS viewports. It saves Grimmory and BookOrbit addresses, saves the
  preferred reader, verifies generated OPDS/Komga links, reloads to verify
  persistence, and checks page width.
- Cypress screenshot files are captured at 1280×720 desktop and 390×720 narrow
  in the available headless Electron runner despite the larger verified CSS
  viewport heights. The images were inspected at
  `/tmp/seerrng-rendered-review-20261005/`; they remain iteration evidence.
- Tests used the freshly seeded disposable SQLite database at
  `/tmp/seerrng-cypress-reader-groupings.vlwN0R`, with reader/provider calls
  limited to local app settings and media-service addresses constrained to
  loopback. No live Grimmory, BookOrbit, Steam, QuestarrNG, or ROMarrNG provider
  was contacted.
- The complete development gate passed after the application and Cypress
  corrections: current-batch contract 569 files; shared-style audit 397/397;
  formatting, lint and both TypeScript checks; Vitest 99 files/452 tests;
  Node TypeScript 385 files/2,912 tests (2,908 passed, four PostgreSQL-only
  skips); native JavaScript 56 files/485 tests; tooling 32 files/238 tests.
  Totals: 4,083 passed, zero failed, four skipped, and zero platform exclusions.
  Log: `/tmp/seerrng-validate-development-final-20261005.log`.
- The Chromium exploratory Cypress attempt timed out waiting for a page load and
  is not counted. The final built-app workflows passed separately under the
  repository's Cypress Electron runner. Human visual review was recorded as
  pending then; it is not a release gate under the user's 2026-10-07 direction.
- Release-note preview, commits, push, and release remain pending. Live Grimmory,
  BookOrbit, Steam, QuestarrNG, and ROMarrNG round trips remain unverified.

## All-dirty commits and forward rebase — October 4, 2026

Every inventoried dirty feature and unrelated change is represented in these
separate commits, retaining the existing recovery stashes:

- `f1b69beda9ac8400dae12183c32c547fc3191e40` reader delivery and managed shelves.
- `4d2e6572a232ddb41adc3b8fbdaca6442df240b6` private games, Steam, and catalog fallback.
- `88eefe3deace753d569284f102f7f00c7daa45b3` per-user external request lists.
- `884259ab5612fff76339d4fafe7e265a7b9bd141` Audiobookshelf scan hardening.
- `ecf3019630e9fe3fc9f3e9ffd6002226b4f3e6ad` request-edit identity repair.
- `14b3c6775dfa45df34ee6e607ebbaba1fb7b17b1` Ko-fi support link update.

All source commits passed the repository attribution and staged Prettier/ESLint
hooks. The first game commit attempt was stopped by ESLint; its seven findings
were fixed at source and the required hook then passed. No hook was bypassed.
The generated OpenAPI file and all integration records are included in the
documentation/API commit.

A fresh fetch advanced `origin/main` from
`f32232a58972e70e7d7862ef3199e3a33b662c50` to
`4665245f97a90d546a94eb25fdcd4c91104bfd7b`. Its sole change relative to the
candidate base is the YunoHost manifest update. The seven candidate commits
were rebased onto that target without conflicts; recovery ref
`recovery/all-dirty-before-main-4665245` preserves the original candidate tip.
The source commits after rebase are:

- `23e84d7aa462d6da6c5293fa8d84b2adfe11e282` reader delivery and shelves.
- `a393ab927550b5069078e24b67db2ca66c44e0cc` game library and catalog fallback.
- `b7b01cf89f8fb832fa8744a4ea63562775e65702` per-user request lists.
- `7cfac9071bbd30ce3ac2c947309649148117c769` Audiobookshelf scan hardening.
- `9e46eca5d3713ad5c40334da1e67c25f25a0c07a` request-edit identity repair.
- `b4bb494bada4f01a9334c7e8aa303c2fab28c521` Ko-fi support link update.

`pnpm validate:development --plan` on the rebased tree selected 99 Vitest
files, 385 native TypeScript files, 56 native JavaScript files, and 32 tooling
files, with zero declared platform exclusions. The prior full gate predates
the game source-level lint fixes and new main target; it is historical only.
The final integrated gate, production build, and rebuilt disposable browser
flows remain pending. No branch push, tag, or release has occurred. Live
Grimmory, BookOrbit, Steam, QuestarrNG, and ROMarrNG round trips remain
unverified; human visual review was recorded as pending then and is not a
release gate under the user's 2026-10-07 direction.

## Reader settings readability follow-up — October 5, 2026

After the integrated gate and production build, the reader settings browser
review identified cramped service cards and generated-address controls. The
follow-up is committed on top of `origin/main`
`4665245f97a90d546a94eb25fdcd4c91104bfd7b`. It gives each reader
service and shelf card a full-width row, places address copy actions below the
generated value, and adds desktop and mobile layout assertions to the reader
Cypress flow. The structured note is
`release-notes/2026-10-04-reader-settings-readability.md`.

A separate candidate's first validation attempt stopped at formatting before
any test lane because parallel locale checks removed temporary `.bak` files;
it is retained at
`/tmp/seerrng-game-library-validation-format-failure-20261005.log` and is not
counted. Its isolated sequential i18n and format checks passed, but they do not
replace the complete gate. The refreshed plan for this candidate selects 99
Vitest, 385 native TypeScript, 56 native JavaScript, and 32 tooling files, with
zero declared platform exclusions. The final gate, clean production build,
and rebuilt desktop/narrow browser flows remain pending on this follow-up.
Earlier build and screenshot evidence predates the reader layout change.
Provider round trips remain unverified. Human visual review was recorded as
pending at this checkpoint; the user's 2026-10-07 direction supersedes it as a
release gate.

## Final verification receipt — October 5, 2026

The full gate on the committed reader-layout source passed. Its inventory was
99 Vitest files/452 tests, 385 native TypeScript files/2,912 tests (2,908
passed and four PostgreSQL-only skips), 56 native JavaScript files/485 tests,
and 32 tooling files/238 tests. Totals: 4,083 passed, zero failed, four
skipped, and zero platform exclusions. The 569-file current-batch check and
397/397 shared-style inspection passed. Log:
`/tmp/seerrng-game-library-validation-final-candidate-20261005.log`.

The production build and separate Chromium 153 Cypress runs used the disposable
worktree `/tmp/seerrng-reader-settings-layout-build`, based at
`bace25a5e2146782a57a4268f0c60f6bcae461c3` with only the reader-layout source
changes unstaged. `cmp` verified that the three changed source/test files in
that worktree are byte-for-byte identical to commit
`752e6b651dc30cf57b7e00b5c6d3ae5a0ec1211a`; the remaining commit differences
are the release fragment and evidence documentation. The build generated
`/games`, `/settings/services`, and `/qa-request-edit`. Logs:
`/tmp/seerrng-reader-settings-layout-build-20261005.log`,
`/tmp/seerrng-final-ui-game-cypress-20261005.log`, and
`/tmp/seerrng-final-ui-reader-cypress-20261005.log`.

The game and reader workflows each passed **1/1** in their separate Chromium
153 headless runs, checking desktop and narrow layouts. Captures are in
`/tmp/seerrng-game-library-final-review-20261005/` and
`/tmp/seerrng-reader-settings-final-review-20261005/`; their rendered content
was inspected. They record the automated rendered-content check. Human-review
status from this checkpoint was superseded by the user's 2026-10-07 instruction.
Tests used disposable SQLite and local app endpoints only; no live
Grimmory, BookOrbit, Steam, QuestarrNG, or ROMarrNG provider was contacted.
Release-note preview and branch push remained pending at that checkpoint.
Human visual review status was pending; these entries are superseded by the
v3.52.1 publication below.

## v3.52.0 publication and CI repair — October 5, 2026

This entry supersedes the earlier pending-release status above. The integrated
feature candidate was released as `v3.52.0` from
`fb50d1f70fdbe44579d89386d70bc50e9f181063`; the GitHub release is published and
the release workflow's Discord announcement job succeeded. The release-note
preview and changelog-tag check passed. The complete development gate on that
integrated source passed 4,083 tests with four PostgreSQL-only skips and zero
platform exclusions. Its production build also passed. Existing desktop/narrow
game and reader browser flows passed 1/1 each; their rendered captures were
inspected earlier in this work. No live Grimmory, BookOrbit, Steam, QuestarrNG
or ROMarrNG provider round trip was performed. Visual review status was
pending in this historical record.

Post-publication GitHub checks exposed three separate results:

1. SeerrNG CI run `37258284100` failed the bundle budget at
   `.next/static/chunks/pages/_app-98ffa76db6165a35.js` (1027.1 KB against
   1024.0 KB). Its unit, i18n, security, and deployment jobs succeeded. A
   separate isolated candidate removes the eager English catalog from the
   shared app entry and has passed its complete `pnpm validate:development`
   gate on the `fb50d1f` base (receipt:
   `/tmp/seerrng-bundle-budget-validation-final3.log`). That candidate has not
   yet been integrated here; its production build and `pnpm bundle:check` are
   still pending.
2. Cypress run `37258284096` failed two settings assertions. The Lidarr help
   copy was present in the rendered modal, but its Cypress query was not scoped
   to that dialog and could select the background service form. The Prowlarr
   responsive spec returned an array for the new reader-settings API route,
   although the rendered settings component requires the object response shape.
   The specs now scope field-copy checks to the open dialog and return the
   reader-settings object plus an empty grouping list from the Prowlarr fixture.
   On the exact `v3.52.0` production build with a disposable seeded config, the
   affected run passed 27/27 discovery tests and 1/1 Prowlarr test, with no
   final failures, skips, or pending cases. The reader settings flow also
   passed 1/1. One discovery test needed a retry before passing; it remains
   recorded in `/tmp/seerrng-v352-cypress-repaired-focused.log`.
3. Chocolatey publish run `37263774763` built the package but received HTTP 403
   from `push.chocolatey.org`. The repository cannot establish package-owner
   authorization through a source change. This channel is not verified as
   published.

The Cypress repairs are test-harness changes only; the visible settings UI did
not change. They are recorded in
`cypress/e2e/library-discover-parity.cy.ts` and
`cypress/e2e/settings/prowlarr-responsive.cy.ts`. The follow-up Cypress checks
used `/tmp/seerrng-v352-prowlarr-isolated`, a disposable seeded test config.
The production server ran from the isolated build worktree
`/home/keith/.cache/seerrng-v352-cypress-repro` at the release commit; no live
service credentials or databases were used.

After publication, `origin/main` advanced to
`6d54a07bce12e222096a9ba5a34add8709bd39e8` for an internal YunoHost manifest
alignment. The Cypress repair is not yet integrated on that new main tip. Before
finalizing a follow-up candidate, preserve its source checkpoint, forward
integrate the latest main and any completed bundle repair, then rerun the exact
full development gate, production build, and affected browser flows. The
Chocolatey 403 and human visual review remain explicit release limitations.

## Post-release CI repairs — October 5, 2026

The repair candidate is now based on the current `origin/main` tip,
`6d54a07bce12e222096a9ba5a34add8709bd39e8`. It combines the English startup
bundle reduction from the separately validated candidate with both Cypress
harness fixes described above. The candidate bundle patch is present in
`src/pages/_app.tsx`, its focused regression is in
`src/components/ManageSlideOver/manageActions.test.mjs`, and the user-facing
performance note is `release-notes/initial-load-performance.md`. The Cypress
fixes are in `cypress/e2e/library-discover-parity.cy.ts` and
`cypress/e2e/settings/prowlarr-responsive.cy.ts`.

The bundle candidate's full development gate passed on its pre-integration
`fb50d1f` base (4,083 passed, four PostgreSQL-only skips, zero failures and
platform exclusions). The Cypress repair passed the 28 affected assertions and
the reader-delivery settings flow on the published `v3.52.0` build, with a
disposable seeded config. These are component evidence only; they do not replace
verification on this combined exact source tree. A preserved source bundle is
`/tmp/seerrng-reader-groupings-before-v352-forward-integration.bundle`; the
integrated candidate's final validation, build, bundle budget and complete
Cypress results will be appended here when available.

The Chocolatey publish 403 and human visual review remain
outstanding. No provider round trips against live services were attempted.

## Project-owner release authorization and v3.52.1 verification — October 5, 2026

The project owner directed removal of the individual-specific visual acceptance
gate and authorized the release without a separate reviewer sign-off. The owner
may confirm acceptance directly under the current contribution policy. This
supersedes the earlier pending release-gate statuses above.

SeerrNG v3.52.1 was published from tag `v3.52.1` at commit
`76632411a3f73d0ad4ea31cb10405496d7db474f`. Release workflow run
`37281708508` succeeded, including `Publish release` and `Announce release to
Discord`. The published release contains 23 assets and the curated English
startup-performance note.

The separate Chocolatey publish run `37291082662` failed. Chocolatey
publication is not verified; the other release publication and announcement
jobs succeeded.

The published release has no live Grimmory, BookOrbit, Steam, QuestarrNG, or
ROMarrNG round-trip claim. The broader Cypress run remains incomplete and is
not recorded as a pass; the prior run entered an unstubbed provider test and
made outbound requests. No further provider tests were run.

## PR #162 forward integration — October 6, 2026

John Cronk's PR #162, “feat(ui): preserve accepted preview and adopt SeerrNG
theme once,” targeted `main` from `JohnCronk79/seerrng` branch
`integration/preview-v3483-20261004`. Its source head was
`8e7d81c6429830ce2143bd243977c3c8e220da81`; the fetched `main` head was
`b46ebfdc6c5e7d7f483f863523f179c1cb27735e`. A rebase produced widespread
historical snapshot conflicts, so the integration followed the maintainer
forward-merge workflow and preserved both published histories. The only
manual source conflict was this checkpoint: the PR's October 4 acceptance and
theme authorization entries were retained with the later `main` entries.
Integration commit: `8c341f4c1d38988b3de1f5775954cbca18e25596`.

The application change is limited to saved-theme migration and account
selection, the Watchlist success state, the documented movie `stale` route,
and corresponding tests and Cypress fixture updates. Existing source-specific
GitHub checks had passed on the PR's original head. Recovery refs preserve the
source and base tips as `recovery/pr162-source-pre-integration-20261006` and
`recovery/main-pre-pr162-20261006`. The work used the isolated worktree
`/tmp/seerrng-pr162-integration-20261006`; unrelated ROMarrNG changes in the
primary checkout were left untouched.

The pinned local toolchain was Node `v24.15.0` and pnpm `10.24.0`. A frozen
dependency install completed without changing the lockfile (SHA-256
`40cb5a6475750b19ec14a381df9ad13ec06b02fa37d9782240cb60da6c877830`). The
comprehensive `pnpm validate:development` run passed translation extraction,
the 569-file current-batch check, inspection of all 397 shared-style
components, formatting, lint, server and client type checks, and all 100
Vitest files (458 tests). The native TypeScript runner completed 2,919 tests:
2,913 passed, four PostgreSQL-only checks were skipped, and two tests in
untouched mainline files failed in this full run. The failures were
`Authenticated metadata resource boundaries` in `server/routes/index.test.ts`
(404 instead of the expected 429) and the hidden-account search case in
`server/routes/user.test.ts` (missing `results`). Both exact cases passed when
rerun alone through the native runner. The full Node JavaScript lane passed
493/493 on rerun after one non-reproducible failure in its first attempt.

The macOS tooling lane could not produce a reliable full pass. Its POSIX
fixtures assume Linux tools: BSD `base64` rejected GNU's `-w0` option, BSD
`stat` rejected `-c`, and the system Bash rejected the `{1,512}` regex bound.
Even with temporary GNU `base64` and Python aliases, 43 tooling tests still
failed on those macOS utility differences. No repository files were changed
to work around the host. Linux CI's tooling job remains required to establish
those results for the integrated head.

The guarded `pnpm build` completed successfully. Translation and current-batch
guards passed, the shared UI style suite passed 68/68, server and client
compilation succeeded, and Next.js generated all 113 static pages. The build
log is `/tmp/seerrng-pr162-build-20261006.log`; validation and lane logs are
under `/tmp/seerrng-pr162-*-20261006.log`. This integration did not run a new
whole-site visual review or live-provider round trip. The PR's documented
preview acceptance remains the visual evidence for its submitted scope.
Fresh Linux CI, including the bundle-budget check, and the PR's required
checks must pass before merging.

After the normal PR-branch push, fresh GitHub checks passed build, bundle
budget, lint, security, i18n, and external-link validation. Cypress exposed one
desktop login smoke failure: a long rotating backdrop title extended beyond
the viewport because the desktop `.page-title` rule permits visible overflow.
The login backdrop now clips that title with an ellipsis in
`src/styles/globals.css`, without changing page titles elsewhere. A fresh
production build passed, including all 68 shared-style tests and all 113
generated pages. The exact `cypress/e2e/public-smoke.cy.ts` file then passed
all four cases locally, including desktop and mobile login. GitHub checks must
rerun against this repair before merge.

## ReadMeABook Phase 7 forward integration — October 6, 2026

The requested source branch is `feat/ng-phase2-tunerr`. Its pre-Phase-7
checkpoint is `03d8d34cbcea3f1d50d239fcbd407d51e0301258`; the Phase 7 feature
commit is `92caf7ed56adcf209d55d536f0e17bf4a51a65a3`. The original common base
was `b46ebfdc6c5e7d7f483f863523f179c1cb27735e`. Before integration, current
`origin/main` had advanced to
`116e3a447364a2b528cad10d99391cb6ee19cb8c`. The original remote feature ref
still points to the pre-Phase-7 checkpoint; the local source branch includes
the Phase 7 commit.

Recovery refs are `recovery/ng-phase2-before-phase7-20261006` at the original
checkpoint and `recovery/ng-phase2-before-main-rebase-20261006` at the Phase 7
source commit. The rebased code candidate reached
`c7f2261dbe43711ba2b37d272afde5e3da19391a` on branch
`integration/ng-phase2-main-20261006`; this evidence is recorded in the next
documentation commit. The integration branch was created separately so
the published feature ref was not rewritten. `git rebase --rebase-merges
origin/main` replayed 23 commits without textual conflicts. The candidate
contains 183 changed files relative to current main (25,342 insertions and
3,099 deletions), including the earlier phases already present on the requested
branch as well as Phase 7. At the time of this checkpoint, no PR had been
opened and no merge had occurred.

The six file overlaps with current main were reviewed: `seerr-api.yml`,
`UserSettings.ts`, both user-settings route/test files, `en.json`, and
`globals.css`. The theme preference and theme-adoption route/tests from main are
preserved beside Phase 7's book-home preferences and routes. The English theme
save message and main's reduced-motion/title-overflow rules are retained. Main
already uses migration timestamp `1791080000000` for theme adoption, which
collided with Phase 7's original ReadMeABook migration timestamp. Phase 7's four
migrations were moved to `1791090000000` through `1791120000000` in both
providers. A regression test checks that these Phase 7 timestamps are unused in
both migration histories; the focused SQLite migration suite passes 2/2.
PostgreSQL migrations were not executed against a database.

The Phase 7 implementation adds the ReadMeABook audiobook search/request and
admin dashboard client, per-user Hardcover sync, configurable per-user
book/audiobook Discover sections, Swipe `full`/`rated`/`favorites` seed scopes,
and admin-created hashed, expiring, single-use login links. ReadMeABook keeps
its download and processing pipeline. The release-note preview passed with
`pnpm release-notes:preview --base origin/main --head HEAD`; it includes the
Phase 7 Bookshelf note and the other user-facing notes already on the branch.

Validation evidence before rebasing is mixed. The complete native TypeScript
rerun reported 3,021 tests: 3,013 passed, four were skipped, and four failed.
Each failure was an auth helper receiving 401 or 404 in discovery, request,
user, or the new book-home settings test. Every exact case passed when selected
alone. The full discovery file passed 124/124, the full user-route file passed
104/104, and a subsequent discovery/request sequence passed 315/315. A separate
four-file sequence had one different request-helper 401, so the cumulative
login instability has not been resolved or waived. The new ReadMeABook,
Hardcover, login-link, Swipe, and migration-focused tests passed in the full
native run or focused reruns. The latest
`pnpm validate:development --plan` selects 103 Vitest files, 409 native
TypeScript files, 58 native JavaScript files, and 31 tooling files, with zero
platform exclusions.

The complete required validation and one production build on the rebased
candidate remain pending. No ReadMeABook or Hardcover live-service round trip,
desktop/narrow visual review, or physical Swipe interaction review was done.
Those boundaries are not presented as automated passes. Finalization requires
a passing gate and build on the integrated candidate, then fresh GitHub checks
after its branch is pushed.

## Final native validation checkpoint — October 7, 2026

On integration candidate `14578084e17df5eaeb5b794c2de68109fdb088ba`, the
validator-controlled native TypeScript retry completed with 3,035 tests: 3,030
passed, one failed, and four were skipped. The failure was
`server/routes/auth.test.ts` / “sets a resetPasswordGuid on the user,” which
ended with `ECONNRESET` (`socket hang up`). This is a failing receipt; the
native lane and full validation are not claimed as passing. Earlier preliminary
validators, formatting, lint, server/client route types, client types, and the
103-file Vitest lane (469 tests) passed in the full validation attempt, whose
native lane also reported two failures. The single failure in this retry was
not investigated further.

Per the maintainer's instruction, no build was run; another agent will handle
it. The integration branch is being committed and pushed for that handoff.
Merging into `main` remains deferred until the build and required checks are
handled.

## Current-main handoff — October 7, 2026

The current handoff branch is `integration/ng-phase2-main-20261007`. Its latest
target is `origin/main` at `1ba2da2033a8c26f5001c7e5a0d6ee58f670a7c1` (release
`v3.53.0`); the common ancestor before the latest rebase was
`cee6572ff86c9765d9ad89dfaaa5ea12626885a2`. The rebased source candidate before
this checkpoint update is `bb8d853ee163fb735d8a08ebad85f12abb646946`.
`git diff origin/main..HEAD` contains 59 files, 4,853 insertions, and 60
deletions. No target-main file is deleted by the candidate.

The latest-main updates are retained: the patched `sharp`, `proxy-addr`, and
`source-map-js` pins and their release note; the Prowlarr Cypress request wait
and explicit response bodies; and the PostgreSQL date-metadata regression plus
issue 164 evidence. The first rebase onto `cee6572` revealed that an older
phase branch would remove those updates. They were restored from main. When
main advanced to `1ba2da20`, the restoration commit became empty against the new
target and was skipped; the final tree retains the newer release and test
changes.

After the latest rebase, the focused command covering ReadMeABook routes,
generated login links, user book settings, Swipe, Phase 7 SQLite migrations,
and PostgreSQL date metadata passed **23 tests in six files**. The dependency
lock check (`pnpm install --lockfile-only --frozen-lockfile --offline`) passed.
Formatting passed with `pnpm format:check`. The release-note preview against
the current `origin/main` contains the Bookshelf entry only.

The exact pushed head `ff9295f58b2964d1897579e29a486b16fb5fee5b` completed a
fresh `pnpm validate:development` run with Node 24.19.0 and pnpm 10.24.0.
Translation extraction, the 594-file current-batch check, the 421-component
shared-style inspection, formatting, lint, and server/client type checks passed.
Vitest passed all 104 files (471 tests). The 417-file native TypeScript lane
passed 3,099 of 3,103 tests; four PostgreSQL-only checks were skipped. The
native JavaScript lane passed 493/493 tests. Platform-aware tooling ran 237
tests: 206 passed and 31 failed on this macOS ARM64 host. The failures include
Linux/GNU command assumptions such as `mv -T`, `stat -c`, `find -printf`,
`tar --transform`, GNU `base64` flags, an unavailable `python` alias, and an
amd64-only package smoke check. The validator exited 1 in this tooling lane,
so the cumulative gate is not green; the raw log is
`/private/tmp/seerrng-phase2-validate-current-main-20261007.log`. No build was
run, as the maintainer assigned that to another agent. No live
ReadMeABook/Hardcover round-trip or new visual/physical Swipe review was done.
That pending instruction is superseded by the completed integration: PR #171 was
merged as `800745e107b2d044045484e74d0f0686239a3e05`, and its result was released
from `fe1ef9790369c4694cb6b7de4444e6c9330dcfc1` as `v3.54.0`. The historical
failed macOS tooling receipt remains evidence of that attempt, not a current
merge prohibition.

## Current-main integration and software-catalog repair — October 8, 2026

PR #175 integrates the remaining published feature branches and security fixes
on `integration/all-branches-main-20261007`. The integration source before the
latest-main sync was `da97fc6accdd44c2965b41797b2ea176c6e95104`; the new target
was `origin/main` at `42397ee61d496337134106ef341a7d8b45ff412b` (v3.55.1), and
their common ancestor was `40bb94fb085026c99b93ea129333ff30de81889b`. Main's
intervening release and feature commits were integrated in merge commit
`4578abe09e79f779db61a6ece9f47e0843efc8b6`.

The forward merge retained both sides of three overlaps. ROMarrNG's version 1
and version 2 request-contract route and regression test from main remain beside
the DAT catalog API and stable DAT identity tests. The software-acquisition
guide documents both the shared versioned route and the optional IGDB/DAT
catalog capabilities. Main's IMDb profile-watchlist repair, AppImage runtime
repair, and v3.55.1 release records are also retained.

The latest hosted unit run found three integration defects: the OpenAPI
contract omitted the platform-mapping preview route and the `romarr-dat`
provider value; a version 2 ROMarrNG connection test did not stub its DAT
platform request; and the DAT software migration reused timestamp
`1791100000000`, already assigned to Hardcover. The API contract and test stub
are corrected. The software migration and its SQLite/PostgreSQL classes were
renumbered to `1791130000000`; the existing cross-history regression now passes.
The failed software-acquisition Cypress assertion occurred before the page's
settings data had been confirmed. Its fixture now uses an explicit response
alias and waits for that response before the existing platform-mapping
assertions.

Focused verification on the latest-main merge passed: ROMarrNG contract tests
5/5, software-route tests 47/47, and the Phase 7 plus software SQLite migration
tests 3/3. Formatting, whitespace checks, and the release-note preview against
`origin/main` passed. The preview includes the merged user-facing feature,
security, and migration-order notes.

The exact merged source was pushed to PR #175. Its fresh GitHub-hosted
validation, including the guarded production build and browser suites, remains
pending on the final checkpoint commit. No local production build, live
provider round trip, or new manual visual inspection was performed. Those
evidence limits are reported separately; explicit maintainer direction to
merge and release removes a separate human sign-off gate.

### Follow-up build and CodeQL repair — October 8, 2026

The first hosted run on the integration checkpoint failed its app build because
the merged `SoftwareProviderCapabilities` interface declared `datCatalog` twice.
The duplicate declaration is removed. The same scan identified an additional
open alert, #538, in `distributed-linux-management.mjs`; together with the
previously listed findings, the current default-branch scan has 12 open alerts.

The file-system-race findings (#538–#545) shared a check-then-read pattern. The
affected evidence readers now read from a pinned descriptor and reject a path
that no longer identifies the opened file. Configuration, marker and runner
attestation readers validate the descriptor and path after opening. A focused
regression test reproduced a symlink replacement that made the old pattern
return attacker-controlled bytes while the original path identity was restored;
the new reader detects the same swap. The CodeQL trivial conditional and
unreachable duplicate-plan guard were also corrected, with a TAP regression
test proving duplicate plans remain rejected. The race test is registered in
the portable tooling suite. The Game Library CodeQL finding points to the test
app's `checkUser` middleware because its production router limiter is skipped
in the test environment. The test app now applies its own active rate limiter
before authentication middleware, so the reported test route is covered.

Focused checks passed: 157 tests, one expected platform-specific skip, and no
failures. The first hosted run passed the unit shard and release-note contract
but failed the app build due to the duplicate type declaration. A fresh hosted
run on the corrected and hardened candidate is required before merging. No local
production build was run.


## Sportarr forward integration and verification — October 8, 2026

The isolated `feat/sportarr-integration` worktree started from
`1ba2da2033a8c26f5001c7e5a0d6ee58f670a7c1`. Before integration, its dirty
source was saved as stash `e3a493f1b3eecdf5e0ad53b39c1c9669768ba16d` and the
verified recovery bundle
`/private/tmp/seerrng-sportarr-preintegration-20261008.bundle`. The worktree
was the only one on this feature branch. It was advanced to current
`origin/main` at `42397ee61d496337134106ef341a7d8b45ff412b`; applying the stash
reported no textual conflicts. The 12 overlapping files were reviewed
semantically, retaining current-main API, settings, ReadMeABook, locale, and
service-availability changes alongside Sportarr. No target-main file was
deleted. Sportarr's PostgreSQL/SQLite migration and test were moved from
`1791090000000` to `1791130000000`, after current main's `1791120000000`
ReadMeABook/login-link migration.

The pre-integration development gate selected 611 files (104 Vitest, 417 native
TypeScript, 59 native JavaScript, and 31 tooling files), with zero declared
platform exclusions. On the pinned Node 24.19.0/pnpm 10.24.0 runtime,
translations, the 593-file current-batch check, the 420-component shared-style
check, formatting, lint, server/client types, Vitest (471/471), native
TypeScript (3,105 passed, four skipped), and native JavaScript (496/496) passed.
The macOS tooling lane failed. Its loopback failure was confirmed as a sandbox
restriction and passed when rerun outside the sandbox; remaining observed
failures use GNU-only commands, assume a `python` executable, or require an
amd64 Flatpak smoke target. The exact tooling case total was not retained in
the filtered gate output. This is a failed pre-integration receipt, not a green
cumulative result.

On the rebased tree, the Sportarr adapter, canonical-identity, and SQLite
uniqueness-migration checks passed 7/7. The four Sportarr discovery/detail/event
HTTP route checks passed 4/4 outside the sandbox. The API schema now leaves
`SportarrEvent.eventDate` unconstrained to ISO format because the adapter
preserves provider strings. The integrated-tree cumulative gate, Linux tooling
receipt, build, desktop/narrow rendered review, release-note preview, GitHub
checks, release, and verification of the released artifact remain pending.
No live Sportarr service round-trip has been performed.

### Episode Queue clarification and ecosystem follow-up — October 8, 2026

The supplied user screenshot clarified that the requested playback feature is
the per-request TV Episode Queue: request one starting episode, then have
linked Plex, Jellyfin, or Emby playback maintain a bounded 1–5 episode buffer
through Sonarr. The existing branch implementation exposes the setting while
creating and editing a request, keeps Off as the default, restores the previous
season/episode selection when disabled, and adds owner-controlled enable/disable
from request cards. The worker matches the linked account and series, waits for
90% playback, counts existing files and active requests toward the buffer, and
creates approved child requests without deleting files.

The focused Episode Queue worker test is new in
server/lib/episodeWatchAhead.dispatch.test.ts. It passes with a disposable
SQLite test database and mocked Jellyfin/Sonarr APIs: linked Jellyfin playback
at 90% advances the parent and creates exactly episodes 2 and 3 for a two
episode buffer. It does not establish a live provider round-trip. The grouped
native suite covering Episode Queue selection/playback, this worker test,
Sportarr adapter/identity, and the Sportarr SQLite identity migration passed
17/17. The TV request-tree React suites passed 24/24, and a standalone full
server/routes/request.test.ts run passed 191/191. The earlier full
server/routes/discover.test.ts run passed 128/128; Sportarr HTTP route tests
passed 4/4. pnpm format:check and pnpm i18n:check passed after the new
worker test and ecosystem appendix were added.

docs/maintainers/market-research-2026-10-06.md now has an October 8 follow-up
with primary-source links and a gap assessment. It identifies Whisparr as the
only additional Arr-style request target found, subject to a product decision
about adult catalogs and separate API validation of its v2 and v3 lines.
Bazarr, Huntarr2, and Recyclarr are recorded as adjacent subtitle/operations
tools; Bindery is a book backend to monitor rather than a confirmed gap.

The first complete local pnpm validate:development attempt stopped in
prerequisite admission before repository tests ran. Its retained receipt is
/private/tmp/seerrng-native-validation-ZctJ3f; the current macOS ARM64 host
does not provide the required GNU find, and the validator requires an actual
Linux read-only mount for the installed dependency reference. The runner's
discovery plan contained 658 selected files (525 Vitest, 58 native JavaScript,
and 75 tooling; zero declared platform exclusions). Discovery is not execution
evidence. The Mac prerequisite failure is not counted as a test failure or a
pass. A full Linux gate, build, source and browser review, release-note preview,
GitHub checks, and released-artifact exercise remain pending. The computer-use
surface reported no connected browsers, so rendered desktop/narrow visual
inspection was unavailable; no live Sportarr or media-server service was used.

#### Final-candidate local runner follow-up — October 8, 2026

The retry used a separate `seerrng-validation` Colima profile with read/write
mounts limited to `/private/tmp` and `/Users/keith/Code`; the existing default
profile was left running and unchanged. Colima downloaded its 3.5 GiB guest
image but could not decompress it: the APFS container had 124.6 MB unallocated
(the host reported 107 MiB available). I removed only that failed attempt's
317 MB cached image. The Linux prerequisite was therefore still unavailable;
no Linux gate stage is claimed as executed. The earlier receipt remains at
`/private/tmp/seerrng-native-validation-ZctJ3f`.

After restoring that temporary disk space, `pnpm format:check`,
`pnpm i18n:check`, `pnpm current-batch:check` (598 files), and its nested
`pnpm ui-style:check` (425 components inspected; 71 style checks passed) passed.
One `i18n:check` attempt before cleanup could not create its temporary locale
backup because the volume was full; it was an environment error, not an i18n
assertion failure. The focused native and React receipts above remain the
executed feature evidence. Hosted checks, build, integration, and release
verification are still pending.

#### Hosted validation repair — October 8, 2026

PR #180's first hosted validation run (37829505156) caught a client type error
before Cypress or Playwright specs started. In
`src/components/RequestModal/TvRequestModal.tsx`, a conditional between full
episode selections and whole-season selections inferred a season-only shape;
the selection snapshot then accessed `episodeNumbers`. Both browser lanes
failed at their shared production build for this same error. The source now
types that snapshot as `SeasonEpisodeSelection[]`, preserving optional episode
numbers for partial selections. After the fix, `pnpm typecheck:client` passed
and the three TV request tree suites passed 24/24. A fresh hosted run against
the corrected commit is pending; the first-run failure remains recorded and is
not counted as a pass.

The next hosted run (37831436745) passed the application build, all four unit
shards, both CodeQL analyses, Playwright, and five of six Cypress shards. The
remaining Prowlarr responsive Cypress spec used a fixture without the newly
required Sports mapping; the settings form correctly kept Test and Save disabled
until every category had a selection. The fixture now includes the standard
`sports: [5060]` mapping, and the existing interaction assertion is unchanged.
A fresh hosted run 37833591956 passed for the corrected candidate. GitHub
validated the synthetic PR merge commit `7b15b40fa15c24ca2a8bed8ca63d8ec57906fe60`,
combining head `630cf235499e5dc1c903c1cf8ac22baa0091be5b` with the then-current
main `42397ee61d496337134106ef341a7d8b45ff412b`. Its immutable validation plan
covered 703 test files: 525 Vitest, 75 tooling, 58 native `node:test` MJS, one
documentation-security, 43 Cypress, and one Playwright file. All applicable
hosted units and both CodeQL analyses passed; the Helm chart job was correctly
not applicable to this PR's file changes.

Executed test evidence: Vitest ran 3,613 tests (3,609 passed, four skipped);
the 58 native JavaScript files ran 481 tests (all passed); the 75 tooling files
ran 858 tests (852 passed, six skipped); Cypress ran all 43 files across six
passing shards (153 passed, 32 pending, zero failed); and Playwright passed its
one test. The four Vitest skips are the pre-existing real-PostgreSQL migration
checks in `server/migration/postgres/mediaUniqueness.test.ts`; they require
`SEERR_TEST_POSTGRES_URL`, which was not configured. The new Sportarr
PostgreSQL index migration was therefore not exercised against PostgreSQL.
Its SQLite counterpart's uniqueness migration test passed in the native test
lane. The documentation image-parser security test, `pnpm build`, generated
API docs plus the documentation-site build, Jellyfin bridge build and smoke
test on Jellyfin 10.11.11, i18n, documentation links, release-note contract,
and JavaScript/Actions CodeQL checks also passed. The aggregate native
validation-engine result is success with no failures.

This is hosted pre-merge evidence for the stated synthetic merge candidate;
integrated-main validation is still required after merge. Rendered desktop or
narrow review and live Sportarr or media-server round-trips were not performed.
Episode Queue playback dispatch was tested with disposable SQLite and mocked
Jellyfin/Sonarr APIs, not a live service.

#### IMDb watchlist WAF report and latest-main sync — October 8, 2026

Issue [#179](https://github.com/snapetech/seerrng/issues/179) followed #174:
the reporter's migrated public profile URL is accepted, but server-side sync
receives an AWS WAF HTTP 202 browser challenge and reports that the public page
was unavailable. The same URL is viewable in the reporter's browser, which does
not establish that IMDb will allow automated requests from SeerrNG's server.

The fix gives users an IMDb CSV import path. The browser parses IMDb's supported
CSV export and posts validated title IDs in batches of at most 100. The
authenticated route verifies ownership and sends resolved items through the
normal `MediaRequest.request` permissions and approval flow. Imported lists
become manual and the recurring worker skips them. No WAF token or browser
cookie is sent to or stored by SeerrNG. Focused coverage passed 17 server tests
and four CSV parser tests; it also verifies invalid IDs are rejected, media
requests use the list owner, and manual imports skip scheduled fetches.

A WAF-token relay was not added. AWS WAF's challenge interstitial completes and
resubmits the protected request in the browser context; its client integration
is configured for the protected site's domain. IMDb's policy also disallows
screen scraping and similar automated collection. Users can open the existing
watchlist link in a browser and import IMDb's supported export.

Hosted run 37859037274 passed the production build, all unit shards, Playwright,
all Cypress shards, both CodeQL languages, i18n, documentation checks, release
notes, and the validation-engine aggregate. That run covered candidate
`a1afb3fd` before PR #180 was merged to `main`. `main` now includes PR #180 at
`091411e2`; merging it into PR #175 retained both branches except for this
checkpoint-file conflict, which is resolved by keeping both integration
entries. The resulting latest-main candidate must complete a fresh hosted run
before merging. No local production build was run.

The push notification also surfaced Dependabot alerts #315–#317 for transitive
Handlebars 4.7.9 (two critical and one medium). The workspace override and
lockfile now resolve to patched 4.7.10. `pnpm install --lockfile-only
--frozen-lockfile --offline` passed, and `pnpm audit --prod` reported no known
vulnerabilities in the updated lockfile. The hosted run for the synced candidate
must be repeated after this dependency update.

## Integrated feature and release verification — October 8, 2026

### ReadMeABook and book services

ReadMeABook Phase 7 was merged in PR #171 as
`800745e107b2d044045484e74d0f0686239a3e05` and shipped in the published
`v3.54.0` release. PR #180's later current-main candidate retained these changes
and passed hosted validation in run
[`37858283340`](https://github.com/snapetech/seerrng/actions/runs/37858283340).
The earlier local macOS ARM64 tooling failure remains a historical failed
receipt; the later hosted candidate passed. No live ReadMeABook or Hardcover
round-trip, desktop/narrow visual review, or physical Swipe interaction review
was performed. The acquisition and download pipeline remains in ReadMeABook;
SeerrNG uses its API for audiobook discovery and requests.

The ecosystem research note now distinguishes three names: `BookDate` is
ReadMeABook's audiobook recommender; SeerrNG's `/swipe` is a separate discovery
feature; and the report's single `BookData` reference was unsupported and is
corrected. SeerrNG has no direct BookLore connector. BookshelfNG supports
BookLore BookDrop uploads, while SeerrNG's reader destinations are Grimmory and
BookOrbit. See `market-research-2026-10-06.md` for the source-backed detail.

### Sportarr and Episode Queue

PR #180 merged as `091411e26701f8ad0cfa454096a8fa3a78fe0e20`. The tagged
`v3.57.0` release commit `3afe778d2c63a3d4ec246d6ae26d027faa9db907` contains
that merge. The hosted PR run passed: Vitest ran 3,613 tests (3,609 passed,
four PostgreSQL-only skips); native Node tests passed 481/481; tooling passed
852/858 with six skips; Cypress passed 153 with 32 pending tests; Playwright
passed 1/1. Builds, i18n, docs, and CodeQL passed. No live Sportarr or
Plex/Jellyfin/Emby round-trip, nor a human desktop/narrow visual review, was
performed. Episode Queue playback was tested with disposable databases and
mocked media-server/Sonarr APIs.

The macOS arm64 release archive's published SHA-256 matched. Started from a
fresh temporary configuration under Node 24.21.0, the v3.57.0 bundle applied
its startup migrations, logged `Server ready`, and served the setup page on
localhost with HTTP 200 after the expected redirect. The process shut down
cleanly, and its temporary configuration was removed. This verifies packaged
startup and the setup UI; it is not a live-provider or visual acceptance test.

The v3.57.0 draft contains the Sportarr and Episode Queue notes. The Helm chart
package was published and signature-verified at chart version `1.0.106` with
`appVersion: v3.57.0`. Follow-up PR #183 made the tag-time README metadata
update idempotent and added the missing internal tooling note. Its complete
hosted PR validation passed; the maintainer merged it as
`23a406f49300d40c8d16146aad074c796e23a5b8`. At the time of this checkpoint,
the v3.57.0 GitHub Release remains a draft while the Ubuntu Jammy and Noble PPA
jobs finish publishing and verifying. Snap, AUR, COPR, Flatpak, Debian, RPM,
and AppImage checks have passed. No `seerr.home` deployment was run by these
release checks.

## Open-issue fixes and complete branch/dirty-worktree audit — October 11, 2026

The candidate starts at current `origin/main` `b9b752a8606e8f5436b50147cd3a64ae03893f04`.
Recovery identities retained before integration are ref
`recovery/current-main-pre-issue-work-20261011` at that base, stash
`22143bb0f3679285adb7e4eceb09af41933fdfd0`, and the verified source bundle
`/tmp/seerrng-validation-20261011-candidate.bundle`. The three Dependabot
workflow branches were reviewed and merged into the candidate as commits
`6e5c68054` (#186 Cypress action), `8ae1528a8` (#187 install action), and
`4a73206f8` (#188 JUnit report action). Their workflow SHA contract tests were
updated with the pins. The action diffs were checked against the upstream tag
commits; #186 contains dependency hardening, #187 strengthens checksum
verification, and #188 includes the fast-uri security update.

All other project-owned remote branch heads are already ancestors of
`origin/main`. The old local release-integration branches contain four
patch-unique commits for ROMarrNG DAT catalog, its integration record,
ChaptarrNG/Audiobookshelf, and the edit-request modal; current `origin/main`
contains their implementation, regression coverage, and release notes. The
validation snapshot branch is not a product source branch. External `upstream`
and contributor-fork branch families were not treated as SeerrNG feature
branches.

The active worktree changes retain the fixes and regressions for open issues
#191, #192, #194, #195, and #197, plus the release fragment and action-pin test
updates. Baseline reproductions and fixed results are recorded separately:

- #191 failed in Playwright because `.swipe-card-body` was transparent; the
  repaired desktop and narrow captures are
  `/tmp/seerrng-issue-191-after-desktop.png` and
  `/tmp/seerrng-issue-191-after-narrow.png` (the original is
  `/tmp/seerrng-issue-191-before.png`).
- #192 movie and series requests initially had no `voteCountGte`; the fixed
  browser checks observed `voteCountGte=50` for both. Explicit minimum-vote
  options remain available.
- #194 reproduced the reported `lateststatuscountid` missing-relation error on
  disposable PostgreSQL; after lowercase underscore aliases, the same query
  returned all seven zero counts. No live database was used.
- #195 pressing Enter on “API” stayed on the metadata page; after the fix it
  navigates to Settings and focuses the API key control. The protected unsaved
  settings flow remains in place.
- #197 the Plex response omitted `email`; after the fix the isolated auth
  regression receives `email`, `plexId`, and `requestCount`, and verifies that
  credentials remain filtered.
- Focused Playwright coverage passed 4/4; focused Node route tests passed 3/3;
  the constants Vitest passed 3/3; PostgreSQL reproduction passed on the
  disposable `kspls0` service. These are focused receipts, not the complete
  `validate:development` result.

Dirty-worktree review found that the support-link removal, English empty-message
payload change, GameLibrary filter overflow fix, reader settings layout and
its Cypress assertions, request-download asset handling, and edit-request
regression test are already in current `origin/main`. The local software
catalog migration uses stale timestamp `179110`; the current tree has its
renumbered migration at `179113`, so adding the old copy would conflict with
the migration sequence. Old reader/game/software snapshots lack newer main
source and were not copied over it. The old validation inventory and tarball
are excluded by the current validation-engine guide, which prohibits copied
inventories and bundles. The diagnostic Cypress spec and
`src/pages/qa-request-edit.tsx` exist only in scratch worktrees; neither is
shipped. The QA page would expose a development fixture as a routed page. The
old snapshot edits that weaken or rename the explicit John visual-acceptance
gate were not applied. No recovery worktree or stash was deleted.

The no-flag `pnpm validate:development` was attempted on `kspls0` for candidate
commit `4a73206f8c4e7ef3fec4e91ab61c71e935d3834e`, source SHA-256
`bb148b432e295fe8b66a01d824aff98f4a02b8106ca3dc48d62ebefd696941e2`. It
stopped in prerequisite admission with status `prerequisite-blocked`; no full
stage or repository test suite ran. The discovery preamble selected 530 Vitest,
0 Node TypeScript, 58 Node JavaScript, and 78 tooling files, with zero declared
platform exclusions. Actual execution was 0 suites, 0 passed, 0 failed, and 0
skipped. The log and preparation report are retained on `kspls0` at
`/tmp/seerrng-validation-20261011/full-gate.log` and
`/tmp/seerrng-native-validation-s5Bcxk/native-context-report.json`.

Required preparation was unavailable for documentation dependencies; Helm,
chart-testing, yamllint and yamale; Lychee; .NET SDK 9; the isolated Docker
fixture proof; and authenticated complete Git history/tag closure. The local
runner also leaves required GitHub PR metadata pending. A second attempt of the
same gate ran inside `unshare --user --map-root-user --net`; its report verified
an isolated loopback-only namespace, but it remained prerequisite-blocked on
the other items above and again executed zero suites. That log and report are
`/tmp/seerrng-validation-20261011/full-gate-isolated.log` and
`/tmp/seerrng-native-validation-srGOWU/native-context-report.json`. The default
no-flag call in `bin/run-local-validation.mjs` does not provide the optional
`verifyDockerFixture`, `verifyGitHistory`, or reviewed-PR-metadata callbacks
accepted by `createNativeStageContext`, so installing the missing CLIs alone
cannot complete those proof checks. Focused verification remains separate:
Playwright passed 4/4, route tests passed 3/3, the discovery constants Vitest
passed 3/3, and the two action-contract files passed 18/18 under an isolated
namespace. PostgreSQL reproduction passed on the disposable `kspls0` database.

The full gate remains incomplete; discovery counts are not execution evidence.
Release-note preview, final commit/push, release publication and issue closure
remain pending. Browser screenshots are automated evidence; they do not replace
the required human visual acceptance for this interface release. This receipt
was appended after the recorded gate attempt, so the resulting worktree has not
been represented as a completed final gate candidate.

### Additional main-worktree changes found during finalization — October 11, 2026

The checkout was moved back to `main` at `b9b752a8606e8f5436b50147cd3a64ae03893f04`
with a separate dirty built-in-TLS fix and its release-note fragment. The latest
stash `stash@{0}` retained the issue-fix candidate and its Playwright/Vitest
regressions; it was applied without dropping the stash. The three reviewed
Dependabot merge commits were fast-forwarded onto `main`, leaving local `main`
at `4a73206f8c4e7ef3fec4e91ab61c71e935d3834e` while `origin/main` remains at
the prior base.

The TLS fix addresses Next.js server-side page/API requests that were sent to
the public HTTP listener after built-in HTTPS repurposed that port for redirect
or upgrade handling. It adds an ephemeral listener bound to `127.0.0.1`, points
server-side API requests at that listener only while built-in TLS is active,
clears the setting when TLS is disabled, and includes the listener in startup
error handling and graceful shutdown. Focused tests were added for loopback
binding, private API access, public HTTP upgrade behavior, and invalid internal
ports. This is a security-sensitive listener change and requires the full
regression review on the integrated candidate.

GitHub's live open-issue list contains six issues, not five: #191, #192, #194,
#195, #197, and #198. Issue #198 asks the documentation to name Issuarr without
removing Mylar3. The Issuarr project's own API guide states that its web API is
the same as Mylar3's; the SeerrNG connector continues to use the existing
`mylar3` service type. User-facing comics, companion-service, setup-assistant,
Unraid, release-calendar, indexer-search, request-status, reader, API-compatibility,
and README documentation now mention Issuarr while retaining Mylar3 guidance.
The combined settings/discovery/auth/request-status release fragment also
records the documentation update. Docs build and link checks remain pending.

The installed-tool `pnpm validate:development` attempt on `kspls0` used the
previous five-issue candidate. Documentation dependencies, chart and link
tools, and .NET SDK 9 were installed in disposable scratch paths and verified
against their frozen lock or published checksums. Preparation now reports three
required blockers: private Docker fixture proof, complete Git history/tag
proof, and chart lint's required target-ref proof. Required release-note and
GitHub PR metadata also remain pending because this is a direct-to-main
candidate with no PR. No full stage ran. The separate `--tests-only` run is
still executing on the earlier candidate; its final counts must not be applied
to the integrated TLS/docs candidate.

## Reported issues and dirty-tree candidate verification — October 11, 2026

This follow-up starts from `main`/`origin/main` at
`ccec04c9cab2a7a537528ee1d56df1533b5ad8f4`. The current dirty tree includes
all reported issue work, the unrelated retained documentation and validation
changes, and the pending feature/doc fragments. The local complete validation
engine has not been represented as passing. This candidate has not yet been
pushed, so its exact GitHub-hosted Mode 2 result is pending.

Issue reproduction and current result:

- #191: the desktop and narrow Playwright baseline showed the swipe-card text
  surface was transparent over stacked cards. The shared semantic card surface
  is now opaque. Final screenshots are `/tmp/seerrng-issue-191-after-desktop.png`
  and `/tmp/seerrng-issue-191-after-narrow.png`.
- #192: browser requests for both movie and series rating sorts lacked a
  minimum vote threshold. Rating sorts now default to 50 votes and expose a
  selectable minimum; final Playwright coverage confirms `voteCountGte=50` for
  both.
- #194: the PostgreSQL failure was reproduced on an isolated disposable
  PostgreSQL 17 database. PostgreSQL folded the unquoted mixed-case derived
  table alias, so its later join referenced a relation that did not exist.
  Snake-case aliases fix the query; the isolated replay returned all seven
  expected zero counts. No live database was touched.
- #195: submitting “API” on Settings Search previously left the current page
  unchanged. The search now opens the main settings page and focuses the API
  key. The final Playwright check passed.
- #197: Plex login returned the ordinary filtered-user response without the
  fields required by strict clients, including request counts. The route now
  populates counts and returns the authenticated profile shape; its regression
  verifies required fields and confirms password/token values remain absent.
- #198: documentation omitted Issuarr. The relevant docs and README now name
  Issuarr and retain Mylar3 compatibility guidance and the existing connector.
- Person-page movie requests are implemented as an administrator-opt-in,
  bounded 100-ID endpoint and UI action. Requests still use normal per-title
  permissions, quota, duplicate, and blocklist handling.
- The Sportarr Port value appeared blank because number inputs were omitted
  from the shared dark form-control selector. The shared role now styles number
  inputs; the final desktop/narrow Playwright check entered `1867`, observed a
  white foreground on a dark input, and passed. Captures are
  `/tmp/seerrng-sportarr-port-desktop.png` and
  `/tmp/seerrng-sportarr-port-narrow.png`.
- Saved per-user destination folders were ignored when new requests did not
  submit an explicit folder. Radarr and Sonarr creation regressions now confirm
  the requester's saved destination is used.
- The partial-request check only rejected episode subsets. The documented
  setting requires every unavailable season, so creation and edits now compare
  the selected season set with every eligible unavailable season. Regressions
  reject one of three seasons and accept all three on both paths. An existing
  single-episode Episode Queue exception remains bounded to its one starting
  episode.
- The screenshot's Carrie email says the request was pending approval. SeerrNG
  dispatches TV requests to Sonarr only after approval; the adapter and
  approved-request subscriber tests confirm selected-season monitoring and
  dispatch. A live Sonarr round trip was not available, so the reporter's
  post-approval monitoring symptom remains unconfirmed in their environment.
- The SABnzbd adapter and queue-client fixtures pass. The screenshot's private
  endpoint and masked credentials were not contacted; whether that connection
  fails against the user's SABnzbd server remains unknown.

Focused verification on this source: `pnpm test:node` over auth, discovery,
request, settings, Sonarr, request-status, SABnzbd, and OpenAPI suites passed
600/600 with no skips. The final `pnpm build` exited 0 after the partial-season
fix and formatting. `pnpm typecheck` passed. Five production-build Playwright
specs passed. Changed-file Prettier, `git diff --check`, the 72 UI shared-style
checks, and all 17 release-note validator tests passed. The PostgreSQL
regression had separately passed 1/1 on its isolated disposable database.
These are focused/local receipts; they do not replace the exact-candidate
hosted engine result.

At this checkpoint the release-note preview, commit/push, GitHub-hosted Mode 2,
release workflow, publication/signing/assets, announcement, and issue closure
are still pending. There are no currently open PRs to merge. The latest
CodeQL, Trivy, and Dependabot baselines had no open findings; GitHub secret
scanning is disabled, and no secret-scan result is claimed.

### Follow-up audit and Edit Request verification — October 11, 2026

This follow-up is on local `main` at `3df985b134885ee39f48add23e3ea49a27f31e23`,
one commit ahead of `origin/main` (`88cfb3c2582dc5e12d70bca571269f5a03942f4e`).
The pre-existing dirty `server/routes/liveTv.test.ts` fixture change remains
untouched. No branch, stash, worktree, or other agent's files were changed.

The screenshot's Edit Request failure occurs when a pending request response
omits `request.media`: the action is rendered, but the old modal mount required
that back-reference. `RequestBlock` now accepts the parent detail identity and
mounts the edit modal from it. The fix and release fragment are already in the
published `v3.58.0` tag. A detached pre-fix Vitest reproduction failed because
the modal was absent; the same regression passes on this source. Matched
headless Playwright runs against the baseline and fixed revisions used the same
mocked pending request. At desktop and narrow widths, the baseline stayed at
one dialog after clicking Edit; the fixed UI opened the second dialog and
showed “Pending Movie Request”. Automated browser evidence does not record
John's required human visual acceptance or prove a live provider round trip.

GitHub reports zero open issues and zero open pull requests. Issues #159 and
#160 are already closed with fix comments linking `v3.52.0`; no duplicate
comments or closure actions were made. The origin branch audit found no
unmerged non-PR branch. Historical PR refs include merged/squashed and closed
unmerged PRs; no open PR requires integration. Sixteen local non-main refs are
stale recovery or validation snapshots whose feature work is represented in
newer `main` source/tests; they were assessed and left intact. `gitlab/main` is
behind `origin/main`; `upstream` and `pr-author` are different repositories,
not SeerrNG branches. No branch changes were made.

On the exact source state above plus the retained dirty fixture, the requested
`pnpm validate:development` no-flag command stopped during required
preparation with `An actual read-only dependency reference is required`. It
executed zero full-gate suites. Inspection confirms the source's installed
`node_modules` is writable, and `bin/run-local-validation.mjs` also omits the
live Docker, Git-history, network-isolation, and reviewed-PR proof callbacks
required by `createNativeStageContext`; those later prerequisites were not
reached in this attempt. The separate `pnpm validate:development
--tests-only` run completed successfully on that source state: Vitest 490/490;
native TypeScript 3,181 passed and 5 skipped (3,186 total); native JavaScript
482/482; tooling 874 passed and 6 skipped (880 total). The overall tests-only
totals are 5,027 passed, 11 skipped, and zero failed. Discovery counts are not
reported as execution.

The `v3.58.0` to current-HEAD release-note preview contains the later
person-page request, TLS, destination-folder/season-selection, Sportarr styling,
and validation documentation changes. No new release was cut because the
required no-flag gate remains incomplete and human visual acceptance is
pending. No commit or push was made; the pre-existing local commit and dirty
fixture remain available for review. This internal ledger entry has no
user-facing release note (`release-note: none`).

### Native prerequisite proof follow-up — October 11, 2026

The isolated candidate's first no-flag attempt stopped because `node_modules`
was writable. A second diagnostic ran the same command on `kspls0` inside
temporary mount and network namespaces: the candidate's app and `gen-docs`
dependency directories were actual read-only mounts, and the network namespace
had loopback only with no route. This passed the read-only dependency check and
completed native tool discovery, but correctly returned incomplete with zero
full-gate stages executed. Its retained report is
`/tmp/seerrng-native-validation-BbzMeX`; selected files were 531 Vitest, 0
TypeScript `node:test`, 58 JavaScript `node:test`, and 78 tooling files. Those
are discovery counts only.

For this isolated candidate, `gen-docs` dependencies were installed from its
frozen lockfile, .NET SDK 9.0.318 was installed under the validation scratch
root, and the existing read-only CodeQL CLI 2.27.1 was added to the diagnostic
PATH. Preparation then identified two required blockers: no private Docker
daemon/bind/loopback proof for the disposable Jellyfin fixture, and no complete
Git history/tag closure proof. The host Docker daemon was not used to run a
fixture or any test. `bin/run-local-validation.mjs` still passes no Git or
Docker proof callbacks to `createNativeStageContext`.

The `tools/validation-engine/README.md` marks distributed Mode 3 dormant and
not an accepted pre-PR gate. No runner code was changed in this follow-up; all
tool installs and namespace mounts were confined to temporary validation paths
and ended without altering the main checkout. The no-flag full gate remains
incomplete, no full suite was executed, and no finalization action is recorded.
This internal receipt has no user-facing release note (`release-note: none`).

The final no-flag retry after this receipt was synced into the isolated
candidate stopped earlier in CodeQL preparation with `ENOSPC`. `kspls0`'s
32-GB `/tmp` tmpfs was 100% full (inode use was 7%). The retained scratch policy
allows automated deletion only after 48 hours of inactivity and protects live
or mounted paths; no scratch directory was removed or moved. This exact-source
attempt produced no native context report and executed zero suites.

### Mode 1 full-gate attempt 21 and browser network isolation — October 12, 2026

Attempt `kspls0-full-20261012-21` sealed candidate commit
`3df985b134885ee39f48add23e3ea49a27f31e23`, tree
`56256540cd2bd9f515c731507d1eff194eca6c6c`, and source SHA-256
`d0efbda9502612447d27f0a5930dc6d2b91c146ad5b744b0958adda920d445a1`. It ran
on `kspls0` inside the disposable Linux guest. The CodeQL stage evaluated 203
queries over 2,313 JavaScript/TypeScript files and 28 workflow files and
produced SARIF. The production build/typecheck, bundle budget, Docusaurus docs
build, Jellyfin 10.11.11 smoke, and one-chart lint completed successfully.
Cypress completed 44 specs with 160 passed, 32 pending, and 0 failed; the
pending tests were the live-authenticated smoke checks without credentials.
Playwright completed 8/8 tests, including desktop and narrow Edit Request
regressions. These results do not make attempt 21 a full-gate pass.

The native repository lane failed before admission because engine unit
`native-repository` did not match the configured proof-parent unit
`repository-unit`. The same run also showed that the browser lane was not held
inside the loopback-only lease: the Cypress seed's dummy Plex token `1234`
caused six read-only watchlist GETs and the Playwright logins caused two device
GETs to public Plex endpoints; all eight returned 401. No live configuration,
provider credential, account, or mutable provider operation was used. This is
recorded as an unintended external test side effect; it is not a live provider
round-trip result. The retained native result is
`attempt-21/state/seerrng-native-validation-L04Gde/native-validation-result.json`;
the stage logs and browser evidence remain under `attempt-21/logs` and
`attempt-21/state/seerrng-native-validation-L04Gde/browser-fixture` on `kspls0`.

The follow-up closes both runner gaps: Mode 1 maps only the fixed repository
and browser stage identities to the configured proof-parent lease, and the
browser stage now runs inside that loopback-only lease. A regression check
requires both stages to enter and restore isolation. The exact updated source
must complete a fresh full `pnpm validate:development` run on `kspls0` before
commit; the integrated tree must complete it again after push. This internal
validation and evidence update has no user-facing release note
(`release-note: none`).

### Mode 1 full-gate attempt 22 — October 12, 2026

Attempt `kspls0-full-20261012-22` sealed candidate commit
`3df985b134885ee39f48add23e3ea49a27f31e23`, tree
`29a888fac56ba339d661aa0ed811f2a4542a375f`, source SHA-256
`cabf651b8e08b6c0afc2f6af814cfa553399cc2540dea8befa1c1aecc703cb0a`, and
lockfile SHA-256
`a5863631513596eb45e67d31c1e159b1ebf823c80a8a10c36a6e4e47794abe51`. The
run executed 13/13 units and selected and executed 719 files, but the required
repository and browser lanes failed. The retained result is
`attempt-22/state/seerrng-native-validation-VSlDWU/native-validation-result.json`
on `kspls0`.

The repository lane reported formatting violations in
`bin/engine-staged-validation.test.mjs`,
`playwright/request-edit-without-media.spec.ts`,
`tools/validation-engine/runtime/distributed-linux-host-containment.mjs`, and
`tools/validation-engine/runtime/staged-validation.mjs`. These four files were
formatted afterward from a disposable copy with the repository formatter and
pinned Node 24.21.0 image on `kspls0`; only the formatted outputs were copied
back. `git diff --check` passed. The attempt itself remains failed and is not
reclassified by that follow-up. A focused `node bin/run-prettier.mjs --check`
on the same four-file disposable copy passed.

CodeQL executed 203 queries over 2,313 JavaScript/TypeScript files and 28
workflow files. Its JavaScript SARIF contains 60 security findings across 31
files; the Actions SARIF contains 0. None of the 60 finding paths overlap the
27 changed source paths in this candidate. This is a scan result, not evidence
that those existing findings are resolved. The production build/typecheck,
bundle budget (314 chunks, 11.71 MB), Docusaurus docs build, Jellyfin 10.11.11
smoke, and one-chart Helm lint passed. Lychee reported advisory root-relative
and unavailable-URL findings under the workflow's non-failing configuration.

Cypress ran 44 specs / 192 tests: 143 passed, 15 failed, 32 pending, and 2
skipped. Failures were in `discover.cy.ts` (2), `movie-details.cy.ts` (5),
`providers/tvdb.cy.ts` (1), `settings/discover-customization.cy.ts` (1),
`tv-details.cy.ts` (4), `user/auto-request-settings.cy.ts` (1), and
`user/profile.cy.ts` (1). TMDB-dependent page and catalog calls failed at DNS
with `EAI_AGAIN` inside the intended loopback-only browser lease; no provider
HTTP round trip occurred. The Plex watchlist tests lacked local title-detail
responses, the TVDB test attempted an external connection check, and the
auto-request test attempted to click a disabled permission control. Playwright
passed 8/8, including the Edit Request regression at desktop and narrow
widths. Its screenshots are stored with the attempt's browser fixture. The
app's image-proxy guard rejected Gravatar test URLs before making requests.

The containment ledger recorded loopback leases around both repository and
browser operations, and the explicit public/private denial probes completed
with cleanup verified. Because the candidate failed, the proof client refused
to issue a complete passing restoration receipt; the attempt is not evidence
of a successful gate or finalized containment lifecycle. The exact failure
list was raised for maintainer direction before changing unrelated Cypress
specs. No commit, push, release, issue comment, or issue state change followed
attempt 22. This internal validation record has no user-facing release note
(`release-note: none`).

### Mode 1 full-gate attempt 27 — October 12, 2026

Attempt `kspls0-full-20261012-27` ran the unmodified sealed candidate from
commit `3df985b134885ee39f48add23e3ea49a27f31e23`, tree
`8ad451de530c3ac22140fe435aa7b7142b116c4f`, source SHA-256
`c174e1fa26fbb2ed7e455f8407a6e085ba21354ff072d85697849d4a3f8ce750`, and
lockfile SHA-256
`a5863631513596eb45e67d31c1e159b1ebf823c80a8a10c36a6e4e47794abe51` on
`kspls0`. The no-flag `pnpm validate:development` command executed 13/13 units
and selected and executed 719/719 files. The full gate failed; this attempt is
not a passing result.

The native Node TAP reader rejected parent `type: 'test'` results that contain
nested tests. The retained Node 24.21.0 report contains 890 `type: 'test'`
rows, 14 `type: 'suite'` rows, and matching summary totals of 890 tests and 14
suites. Node counts a parent test and each nested test as separate test rows.
The reader's blanket rejection prevented its case ledger from closing against
the reporter summary. A regression now generates real TAP with a nested Node
test and checks the parent and child roles and summary counts. The parser now
counts every `type: 'test'` row independently and verifies `# tests`, `# pass`,
`# fail`, and `# skipped` against those rows; suites remain counted separately.

The proof-parent fixture configured a 60,000 ms maximum loopback lease. The
attempt recorded lease intervals of 950.9 seconds and 405.9 seconds, so both
exceeded that bound and no complete restoration receipt was issued. The next
candidate uses a 1,800,000 ms lease maximum, within the proof parent's one-hour
hard limit. The loopback-only repository/browser policy and denied public
egress probes remain enabled. The next full run must show successful lease
restoration and a complete proof receipt before the gate can pass.

The attempt's builds, type checks, CodeQL stage, bundle budget, documentation
build, Jellyfin plugin smoke, Helm lint, Cypress run, and Playwright run
completed. Cypress reported 44 specs / 192 tests: 160 passed, 32 pending, and
0 failed or skipped. Playwright passed 8/8 tests, including desktop and narrow
Edit Request cases. The native Node run reported 890 tests: 868 passed, 16
failed, and 6 skipped; the parent accounting rejection made native repository
case closure fail. The helper image also lacked `ssh-keygen`, `sqlite3`, and
`zip`, which caused tooling cases to fail before execution. A new helper image
adds those tools; the old image and all attempt-27 evidence remain preserved.

### Mode 1 full-gate attempt 28 preparation — October 12, 2026

The Node 24.21.0 helper image was rebuilt under the new tag
`seerrng-validation-helper:node24-20261012-r28` from the pinned base image and
a retained Dockerfile that adds `ssh-keygen`, `sqlite3`, and `zip`. On `kspls0`
with networking disabled, the real nested-TAP regression passed 1/1 and the
complete `bin/engine-native-accounting.test.mjs` file passed 12/12. The first
focused regression attempt exposed Node's inherited `NODE_TEST_CONTEXT` marker;
the test now removes that marker before starting the child reporter. The test
was expanded to check a failing child, its failing parent, and a passing child;
the expanded regression and full file both passed.

Attempt 28 uses an independent `candidate-r28` copy and all current tracked
and untracked worktree paths. Its private Docker daemon is separate from the
outer guest daemon, uses only a Unix socket, and has the pinned Caddy fixture
preloaded before validation. The generated proof configuration retains
`baseline-public` with loopback-only access during repository/browser stages,
14 IPv4 and 4 IPv6 denied CIDRs, and a 1,800,000 ms lease ceiling. The first
daemon start lacked its state socket directory; creating the directory let
the retained daemon start. The first snapshot generation also hit `EACCES`
because root ran without `CAP_DAC_OVERRIDE` against a UID-1000-owned state
mount. Only attempt-28 config/state/log directories were given root ownership,
after which snapshot generation succeeded. A focused-test container completed
with exit 0 before its log wrapper hit a host-directory permission error; its
output was recovered through Docker logs and is retained with the attempt.

The exact corrected source, generated 1,800,000 ms lease config, and renewed
containment evidence still require a new complete no-flag gate on `kspls0`.
This internal validation record has no user-facing release note
(`release-note: none`).

### Mode 1 full-gate attempt 28 preflight and bridge correction — October 12, 2026

The first attempt-28 proof-parent launch failed during preflight before the
validation engine started. The helper network namespace already contained the
private nested Docker bridge as `docker0` with the configured
`198.51.100.0/29` address and connected route. `verify_bridge_not_overlapping`
treated those expected resources as an overlap with the helper network and
stopped with `Private Docker bridge overlaps a helper address`; no native
validation result or application-suite result was produced by that launch.

The proof parent now permits exactly the configured bridge interface when its
network and gateway match the configured bridge CIDR, and exactly one matching
connected route. It still rejects any other overlapping interface or route,
rejects an unexpected bridge address or subnet, and requires both the expected
interface and route to exist. Regression cases exercise each of those paths.

On `kspls0`, the complete focused
`bin/engine-distributed-linux-proof-parent.test.py` suite passed 15/15. This is
focused unit evidence for the bridge fix only; it is not a full-gate result.
The test ran from an isolated scratch copy under
`/home/keith/.cache/seerrng-validation-20261012-r29-focused`; the application
checkout and existing containers were not used as test fixtures.

A fresh exact-source snapshot and complete no-flag `pnpm validate:development`
run are still required. This internal validation record has no user-facing
release note (`release-note: none`).

### Mode 1 attempt 30 platform preflight — October 12, 2026, 14:00 UTC

The r30 source snapshot includes all 35 current-checkout dirty paths, with
candidate source SHA-256
`b802e232958ccd73cd6fb8d84ed839ba03f6057f7b1c04aeaf69dd0bfadc631f` and
lockfile SHA-256
`a5863631513596eb45e67d31c1e159b1ebf823c80a8a10c36a6e4e47794abe51`.
Prerequisite verification passed and the focused
`bin/engine-distributed-linux-proof-parent.test.py` suite passed 16/16 on
`kspls0`. This was focused verification, not the full development gate.

The pinned nested Docker daemon is version 29.8.2. The kspls0 kernel is
`7.2.4-arch1-2`; neither `/lib/modules/7.2.4-arch1-2` nor
`/usr/lib/modules/7.2.4-arch1-2` exists, and
`modprobe -n br_netfilter` reports that the module is unavailable. The daemon
therefore cannot initialize the exact private bridge required by the gate.
The gate also requires `--userland-proxy=false`; the diagnostic daemon using
`--userland-proxy=true` was Unix-socket-only, had no TCP listener, ran no app
tests, and was stopped with its logs and volumes retained.

Moby documents `DOCKER_IGNORE_BR_NETFILTER_ERROR=1` as an override for hosts
without `br_netfilter`, with reduced bridge-network behavior. That override is
not part of the sealed validation manifest and was not used. No repository
containment assertion was relaxed. The full `pnpm validate:development` gate
was not started because the pinned bridge containment prerequisite cannot be
proven on this kernel. No commit, push, release, or issue mutation followed.

The refreshed `origin` remote has 17 named branches, all ancestors of
`origin/main`. Its additional `refs/pull/*` refs are historical pull-request
snapshots, not branch heads to merge. Local release-integration refs retain
older copies of work represented by later commits on `main`; recovery and
validation-snapshot refs remain preserved. Other pre-existing worktrees contain
staged and unstaged changes; they remain untouched and are not represented by
the 35-path r30 source snapshot. This internal validation record has no
user-facing release note (`release-note: none`).

The local-only `main` commit `3df985b134885ee39f48add23e3ea49a27f31e23`
changes user-facing comic backend and setup documentation. Added the required
upcoming release fragment `release-notes/2026-10-11-issuarr-comic-setup.md`.
The final release-note preview remains pending until the complete integrated
candidate is assembled.

Read-only GitHub checks at 2026-10-12 14:00 UTC returned no open issues and no
open pull requests. Issues #159 and #160 are already closed and each has a
maintainer comment linking its fix to v3.52.0. The latest published repository
release is v3.58.0 (October 9, 2026); no duplicate issue comments, closures,
or release were made while the required validation prerequisite is
unavailable.

### Security and Mode 1 source review — October 12, 2026, 15:34 UTC

Fresh read-only GitHub API checks returned zero open issues, pull requests,
CodeQL alerts, Dependabot alerts, and secret-scanning alerts. The 13 currently
listed GitHub branch heads are already ancestors of `origin/main`; no branch
protection changes were made. The latest published release remains v3.58.0.

The newest CodeQL JavaScript and Actions SARIF analyses are from October 11 at
commit `e5de8feec8e0f6470b3311f41939210b8debed57`, earlier than the current
`origin/main` commit `88cfb3c2582dc5e12d70bca571269f5a03942f4e`. The JavaScript
SARIF contains 60 findings and the Actions SARIF contains 0; all alert objects
are dismissed (112 false positives, 1 mitigated, 11 used in tests, and 42
won't fix). Latest Trivy SARIF for both published image architectures on
`origin/main` contains 0 results. None of this is a CodeQL scan of the current
dirty candidate.

Two dismissed high Dependabot advisories remain in `gen-docs/pnpm-lock.yaml`:
`braces@3.0.3` (#285, also present in the root development lockfile) and
`http-cache-semantics@4.2.0` (#286). GitHub marks both `tolerable_risk`. The
advisories still list no patched version. The braces upstream security PR #72
is closed unmerged; the http-cache-semantics report is closed as not planned.
The existing dependency follow-up prohibits unpublished pins and unreviewed
forks, so neither dependency was changed. These are recorded as unresolved
development/build-tooling risks, not fixed findings.

Static review of the 36-path working candidate found two defects in the new
Mode 1 validation path. Its Git helper checked the configured GitHub origin but
did not check Git's effective URL after repository-local `insteadOf` rewrites;
it now checks the resolved origin and has a regression for local redirection.
The proof parent also injected the Mode 1 request hash into every child, which
would make ordinary Mode 3 runs require a nonexistent Mode 1 request; injection
is now conditional, and the tests cover both modes. Both changes are unrun and
remain subject to the exact-candidate focused and full gates.

The full `pnpm validate:development` gate has not been rerun after these edits.
Attempt 30 remains blocked before the gate by the `kspls0` kernel's missing
`br_netfilter` module. Current LAN MCP controls report
`allow_write=false`, `allow_packages=false`, `allow_filesystem=false`, and
`allow_reversible=false`; no host files, packages, containers, or units were
changed. The current Node runtime is 22.23.3 while the repository requires
Node 24.15 or newer in the 24.x line, so the release-note preview is also
pending. No commit, push, release, issue comment, or issue state change was
made. This internal follow-up has `release-note: none`.

A read-only worktree inventory found 36 dirty paths in the root candidate and
additional uncommitted changes in sibling worktrees, including older
integration snapshots with up to 106 dirty paths. Several registered worktree
paths are unavailable. None of those worktrees was edited, staged, stashed,
or cleaned. Their uncommitted contents are not included in the r30 snapshot or
in the root candidate's evidence; they remain pending separate ownership,
source, and validation review before any all-worktree integration claim.

### GitHub security and candidate follow-up — October 12, 2026, 15:47 UTC

The current GitHub API still reports zero open issues, pull requests, CodeQL
alerts, Dependabot alerts, and secret-scanning alerts. Repository settings
confirm secret scanning and push protection are enabled. There are 166
dismissed historical CodeQL alerts; none is open. The latest CodeQL analyses
are on `e5de8feec8e0f6470b3311f41939210b8debed57`. Its source tree is identical
to `origin/main` `88cfb3c2582dc5e12d70bca571269f5a03942f4e`; the newer main
commit is empty. The CI run for `88cf` succeeded, with CodeQL and browser suites
skipped by the selected validation inventory. The dirty candidate changes
validation-engine source, so it still needs a fresh exact-candidate CodeQL and
browser run through the required gate. Latest Trivy analyses of both published
architectures on `88cf` have zero results.

Two dismissed high Dependabot advisories remain: `braces@3.0.3` and
`http-cache-semantics@4.2.0`, both confined to development/documentation tools
per the dependency follow-up above. Current GitHub Advisory Database pages
still list no patched release for either. The braces report remains disputed
by its maintainer, and the http-cache-semantics maintainer closed its report as
not planned. No local fork or unpublished override was added under the
existing repository policy.

GitHub lists 13 remote branches; each is strictly behind `origin/main` with
zero unique commits. The branch-protection endpoint confirms `main` is not
protected. Local release/recovery snapshots and sibling dirty worktrees remain
preserved; they were not staged, changed, or copied into this candidate.

The root candidate remains at `3df985b134885ee39f48add23e3ea49a27f31e23`, one
commit ahead of `origin/main`, with 36 dirty paths and nothing staged. The
current LAN control policy still has writes, package installation, and
filesystem access disabled. The latest `kspls0` snapshot call returned a
transport error, and the previously recorded missing `br_netfilter` module
still blocks the required private-bridge prerequisite. No tests or builds were
run from this checkout. The full gate, release-note preview, commit, push,
release, and any issue mutations remain pending. This internal follow-up has
`release-note: none`.

### Issue #199 and validation-security integration — October 12, 2026

The refreshed GitHub remote has `main` at `da92ba75ff252213d86d3f4a5850af5c29f49b58`, PR #203 at `4045490671b72985b3111d312d29e5595ff539db`, and PR #202 at `b08243c3d0e4fd077c1ce9095a2ccba28de7622f`. The local #203 candidate is `a3c114fa1ab1673b8d73c3839d788afa46efd460`, which already merges the earlier #202 commit `8b23dfd857af7191f9674629e0229dc49eaa9d79`. The latest #202 tip descends from that commit and has been merged into the working candidate without removing the #199 change; the final merge and working-tree fixes are not committed yet. No changes were made to `main` or its branch-protection settings.

The verified issue #199 reproduction remains: on baseline `da92ba75`, the new route regression test returns `404` instead of the expected `204`; on the candidate, the stale `AVAILABLE` status clears after a fresh inventory check and a new request is accepted. The edit-request no-media regression also failed for both movie and book on pre-fix commit `7cfac9071bbd30ce3ac2c947309649148117c769`; the current focused unit coverage passes. Its Playwright desktop/narrow run and visual review remain pending.

Security review of the new disposable validation workspace found that root `.env` files were filtered but nested `.env.local` files were copied into the snapshot. A regression test reproduced that leak before the fix. The path filter now excludes nested environment files while retaining `.env.example`; the isolation test file passes 3/3 with zero skips, including dependency-root containment and loopback/network canaries. The issue/UI/API focused Vitest run passes 77/77 tests. Changed-file Prettier checks and `node bin/check-i18n.js` pass. The whole-tree formatter has not passed on this workstation because it cannot read an unrelated ignored path under `.bookshelf-migration-lab`; the clean-checkout formatting gate remains pending.

GitHub currently reports zero open Dependabot, Code Scanning, and secret-scanning alerts. Direct records show alerts #285 and #287 (`braces`) and #286 (`http-cache-semantics`) fixed; the advisories still list no upstream patched release, and the affected packages are absent from the lockfiles. A filtered dismissed-alert listing still returns #285 while its individual record reports fixed with no dismissal metadata; it is treated as a stale list result. The disposable `kspls0` root/docs installs and audits succeeded with Node 24.20.0 and pnpm 10.24.0, reporting zero vulnerabilities.

The earlier `pnpm validate:development --tests-only` process was stopped after it had run against the earlier `a3c114fa` candidate and PR #202 advanced. It had reached Native TypeScript case 790 without a reported test failure, but it did not complete and is not a passing gate. Complete hosted Mode 2 validation of the final integrated commit, full format/i18n gates, build, Playwright, Cypress, and final visual review remain pending. The active GitHub work is issue #199 and PRs #202/#203; no release or issue state change has been made. At the last remote branch audit, all 27 confirmed stale remote refs had been archived and deleted, leaving only `main` and the two open PR branches. This evidence update is internal-only (`release-note: none`).

## Navigation regrouping PR #253 forward integration — October 13, 2026

PR #253 source head `8d57ee38ce3dd8924fbab8070485882cbead801b` was based on
`e284420ee3683dd4ba3bfa2facc241c84cdba41e`. Current `main` is
`868e156d7e40cd676a3c7ca908d0091fd94566e1`, which adds the merged request and
scanner recovery work from PR #214. Recovery refs were retained for both the
original PR head and current `main`. Integration used an isolated worktree at
`/tmp/seerrng-nav-integration-20261013`.

The three-way inventory found shared edits only in
`src/styles/globals.css` and `docs/maintainers/ui-style-standard.md`. Both
merged automatically; review confirmed the navigation owners were retained
alongside current-main request/layout changes. The other main-side request,
scanner, and entity changes were preserved. The style-standard navigation
entry was also renumbered to keep its ordered list unique. Integration commit:
`af5c75380`, `merge: integrate current main into navigation regrouping`.

Before integration, exact head `8d57ee3` completed Mode 2 with a Cypress shard
failure and a failed native-engine result. Cypress reported 19 of 20 tests
passing in that shard; `user/auto-request-settings.cy.ts` could not click a
disabled `#autorequest` checkbox. The spec is unchanged from current `main`.
The full Cypress matrix passed on the current-main PR #214 run
`38409023729`, so this failure's cause is not established. The merged candidate
requires a fresh exact-head Mode 2 run; the earlier failure is not waived.

The original candidate's focused Vitest (18), current-batch contract (41),
ESLint, client typecheck, current-batch/style check, and release-note preview
passed. Those focused results do not cover the integrated tree. No local visual
inspection was performed and no host screenshots were taken. The fresh Mode 2
plan, Cypress/Playwright, build and native receipt reconciliation remain
required on the integrated head. The user-facing navigation note remains
`release-notes/20261013-navigation-regrouping.md`.
