# Provider resilience recovery validation (2026-11-05)

Recovered contributor histories: #484, #465, #468, #470, #460, #459,
#456, #442, and #475. The integration retains their commits and repairs
additional defects found during review.

- GitHub commit queries use the documented `sha` branch parameter; failures
  have a five-minute cache and successful checks retain their longer TTL.
- Malformed Plex success responses cannot erase saved libraries; an explicitly
  empty valid container can still clear libraries. Jellyfin renames preserve
  stable library scan timestamps.
- Dedicated Steam and Cover Art Archive clients apply both configured proxy
  routing and the versioned user agent. Injected Steam clients stay supported.
- Anime uses its configured directory unless a distinct custom root is selected.
- Search normalization runs only after an unmatched original query and retains
  page, language, and adult-content scope.
- Discover retries and skips one isolated transient page failure. Initial,
  consecutive, authentication, permission, and rate-limit failures remain errors.
  Unit regressions verify the retry bound separately from view revalidation.

## Browser evidence

Headless Chromium compared the production baseline and candidate at 1440×900
and 390×900 on `/discover/movies` and `/discover/tv`. The shared discovery
controls, title cards, mobile navigation, and selected Title button retain their
existing semantic CSS owners; no CSS or layout values changed. Movie requests
use `original_title`, series requests use `original_name`.

Four populated screenshot pairs match pixel for pixel except the independent
fixture account's desktop movie-page avatar (44×52 pixels). Both baseline
failed-page tests retain the first page and never reach page three. Both
candidate tests reach page three after page two's simulated 503 failures.
Service workers are blocked for deterministic provider interception.

The complete production build, server/client typechecks, changed-file lint,
focused native tests, and eight Discover hook regressions pass locally.
Browser checks use simulated provider responses, not a live TMDB account.
Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`.
