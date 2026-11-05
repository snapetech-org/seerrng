# Discovery contribution recovery

Recover original histories for PRs #455, #488, #450, #472 and #463. These add
pending/processing request visibility, requested-title hiding in Discover grids,
TMDB collection Search, metadata sorting in request history and person-credit
sorting/filtering. Original contributions are repaired before integration.

## Confirmed root causes

- Grid filtering bypassed `search` but global Search supplies `query`, hiding
  explicitly searched requested titles. Both explicit-query owners now bypass
  Discover-only requested-title filtering. Video-only filtering, bounded scanning
  and the existing Continue Search recovery action remain intact.
- Numeric credit IDs were grouped without media type, collapsing a movie and TV
  show with the same ID. Shared grouping includes media type and preserves repeated
  characters/jobs within the same title. React keys retain this identity when
  sorting changes.
- Metadata sorting retained a process-wide TMDB client and a language-independent
  cache. Changing the instance language left old titles and new provider requests
  in the initial language. Lookups now capture language, partition the bounded
  cache/in-flight map by language and create a fresh client when loading metadata.
- The collection-search release fragment lacked required structured metadata.

## Evidence and acceptance

Task artifacts live at
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`.
Actual baseline failures are retained in `discovery-requested-query-baseline.log`,
`discovery-person-identity-baseline.log` and
`discovery-metadata-locale-baseline.log`. The latter reproduces both stale-cache
and stale-provider-client language behavior.

Focused hook/person tests pass 18 cases; collection-search API tests pass 38
cases, including duplicate collection IDs and omission for movie maturity limits.
Client typecheck passes. Four matched desktop/phone baseline browser cases pass
at 1440×900 and 390×900. Person and request-history controls reuse CompactSelect
and shared filter owners; no new design values are introduced.

The combined full `pnpm build` path passes on Node 24.22.2, including i18n and
current-batch/UI prebuild gates. Final owner CI remains required before integration.
Provider access uses fixtures and does not certify live upstream availability.

## Final integration and responsive repairs

The candidate preserves the complete history of PR #560 and its 12 original
contributions, alongside the five originals above. Combining the filters retains
viewer availability and requested-title backfill with the existing scan limit.
Request-history sorting retains Persius account scope and its secondary controls;
classic filters are restored above results through one shared JSX owner.

Full owner CI on the earlier combined source passed 4,017 native cases with five
skips. Its one browser failure was reproduced in a complete local sequence and
traced to `login-link-user-search`: 404px document width at a 390px viewport.
SeerrNGJ applied its two-column settings grid on phones; the one-column rule only
existed in preview containers and had weaker specificity. The existing theme
owner now applies the matching one-column selector at its established 639px
breakpoint, in both live and preview contexts. Desktop values are unchanged.
The generated comparison page is synchronized to that owner.

The policy/save/overflow checks pass at 320, 390, 639, 640 and 1440px. Twelve
additional matched cases cover Users, Services, Network and General settings at
390, 640 and 1440px. They await the active stylesheet and use identical service
fixtures. Nine screenshot pairs are pixel-identical; the three changed pairs
are the intended phone stacking on Users, Services and Network. They were
visually reviewed, including text, field/control widths, cards and navigation.
Main settings and all tablet/desktop pairs retain their prior rendering.
Evidence: `settings-grid-final-*`, `settings-phone-grid-fixed-*` and the
`settings-*-review.jpg` captures. Earlier 55125 captures show the legacy theme
host; final comparisons use the native #560 runtime on 55129.

Eighteen discovery browser cases pass across SeerrOrig, SeerrNGJ and PersiusNG
on the combined production build and verify
credit identity/sorting, explicit requested Search and metadata-sort fallback
without losing requester scope. Additional focused native checks pass 38 Search
API cases and eight metadata/sort cases; hook/person checks pass 18 cases.

The interface-theme persistence test now blocks service workers while installing
provider/avatar fixtures. Otherwise service-worker requests bypass Playwright
routes after reload and turn an offline provider failure into a false theme
failure. The test retains its console/page-error checks and passes offline.
Failure screenshots and overflow owner dimensions are retained for Quick Connect.

The first final tooling CI exposed a stale negative fixture: it tried to remove a
callback using `currentSortDirection` after metadata sorting introduced the
resolved `effectiveSortDirection`. The mutation was a no-op, not a product
failure. It now removes the actual callback and explicitly asserts that the
fixture changed before checking that the guard rejects it. The production guard
and browser sorting assertions remain strict.
