# Theme contribution recovery

Original histories #424 (native Persius and community theme authoring), #416
(theme package hardening) and #457 (public stylesheet validation and Node patch)
are retained together. Their old readiness notes describe their original heads;
they are not proof of this integration's acceptance.

## Review repairs

- Preserve current shared styles, 20px/24px theme input sizes, narrow-phone
  cascade fixes, request Episode Queue editing and discovery failure recovery.
  The existing SeerrOrig, SeerrNGJ and shared interface CSS are byte-identical
  to main. Persius has its independent package and native composition.
- Preserve public GitHub-hosted routing, current server asset copying and
  migration packaging. Both server build entry points must retain the asset
  copier. Node 24.22.2's archive checksum and official Alpine image digest were
  verified; the Bookworm pin uses the current verified official index.
- Consolidate duplicate OpenAPI theme schemas and paths. The automatic merge
  otherwise returned HTTP 500 before route admission. Keep strict metadata
  bounds and the optional native layout field.
- Replace check-then-read theme files with bounded descriptor reads. Reject
  symlinks, hard links, oversized input, swapped inodes and changed parent
  directories; close descriptors on failure. A race regression substitutes a
  symlink between validation and open, and another replaces a regular file.
- Preserve the pending-stylesheet race test by disabling both automatic fixture
  load mechanisms while deliberately keeping the next stylesheet pending.

## Observed verification

- Production server and client builds and client/server type checks passed
  using a checksum-verified task-local Node 24.22.2 installation.
- 370 native checks passed across request mutation, subscriber completion,
  book destination and edition identity, future seasons/migration round trips,
  theme API/package/file/registry and test-runner completion. The PostgreSQL
  migration class round trip here uses SQLite SQL compatibility; this is not
  proof of a live PostgreSQL upgrade.
- 68 component/adapter checks passed after correcting two stale fixtures;
  55 tooling checks passed, including CLI round trips and network isolation.
- The compiled CLI created, packed and installed `recovery-cinema`, an
  independent Persius derivative used by the browser acceptance test.
- 20 headless Chromium cases passed: nine native screens at desktop, 768px
  tablet and 390px phone widths, account switching, installed theme loading,
  request recovery/owner scope, season selection, narration choice and palette
  save recovery. The exact viewports are recorded in the test and captures.
- Two baseline browser cases captured 20 matching classic-theme route/state/
  viewport pairs. Eighteen PNGs are identical; the other two differ by a few
  raster pixels without geometry changes. Desktop/phone contact sheets and the
  390x844 season dialog were visually checked against the contribution's
  references. Overflow, keyboard and interaction assertions passed.

CI follow-up repairs keep absolute server imports with an explicit checkout CLI
alias, associate native season/switch labels with stable input IDs, and retain
literal URL control-character rejection without an ESLint control-regex escape.
Provider audio-only samples have no supplied timed text; the preview's caption
lint exception is scoped and documented rather than adding fictitious tracks.
The repaired CLI passed seven round trips, the component group passed all 68
checks, and 12 affected native checks passed. Production and documentation builds
passed; the remaining Quick Connect documentation anchor was matched to its
rendered target and corrected. Release fragments respect the current size limit.

## Combined request-controls validation

The branch also retains integration #556 and original histories #447, #446 and
#491. Both the video destination synchronization and exact-book edit planner
remain in the request route. The discovery hydration guard repairs the Cypress
failure seen on main and the first theme CI run.

The combined production build passed, followed by 296 native checks, 74 component
checks and 28 headless browser cases. These groups overlap earlier validation;
their counts are not added to the earlier totals. All eight user-facing release
fragments pass the current contract. Main's validation container was advanced
to the verified Node 24.22.2 index through #558 before requesting combined CI.

Evidence is retained in the 2026-11-05 contribution-recovery task artifacts,
including failing cases, screenshot comparisons, checksums and logs. Fixtures
control provider responses; no live provider acquisition or physical-device
handoff is certified. Combined integration CI remains required before delivery.

## SVG loading-state capture

The final full browser run passed 105 cases but timed out comparing identical loading-state frames because the visible SVG spinner uses SMIL, which Playwright CSS animation suppression does not freeze. The capture helper now pauses SVG animations at frame zero while taking the image and resumes them afterward. The loading, empty, error, and retry regression passes with the indicator preserved. No production UI code changes.
