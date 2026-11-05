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
and shared filter owners; no styles or new design values are introduced.

Candidate production rendering, visual comparison and final owner CI remain
required before integration. Provider access uses fixtures and does not certify
live upstream service availability.
