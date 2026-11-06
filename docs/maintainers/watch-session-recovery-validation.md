# Private watch-session contribution recovery

Original PR #477 is preserved by merge ancestry. It implements invitations and
private ballots, separately from progressive collection queues. Its original
acceptance explicitly lacked tests and screenshots; that is not a reason to
discard the feature.

## Repairs

The baseline API suite reproduced four failures: movie-only requesters were
rejected, participant movie maturity caps were ignored, temporary age-gate
filtering deleted candidates and cascaded private ballots, and mismatched TMDB
identities were accepted as session candidates.

The shared policy now combines the existing group age gate with every current
participant's movie cap on decks, ballot writes, private choices and matches.
Unknown certification fails closed when an account cap applies. Provider identity
must match the stored candidate. Filtering preserves anonymous candidate IDs and
ballots; the bounded deck scans past hidden entries and advertises more results
only when eligible results or bounded undiscovered pages remain. Watchlist
contributions retain bounded anonymous identities and are filtered on every read.
Movie-only permissions are accepted by both the API and shared navigation model.

Draft edits use conditional updates rather than saving a stale session object.
Watchlist consent changes serialize against starting or changing membership and
recheck draft state inside that transaction.

Screenshots exposed missing card padding and section spacing. The components now
consume existing refreshed main/inset surfaces, card stacks and page-content
flow. Heading text uses the shared ellipsis owner. No stylesheet, theme dimensions
or shared component geometry changed.

## Validation and limits

Evidence root:
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`.

- `watch-session-baseline-regressions.log`: four actual failures, one pass.
- `watch-session-final-policy-matrix.log`: 15 native API cases pass, including
  every projection, ballot rejection, unknown certification, policy removal,
  bounded pagination, nonmember administrators, one-use invitations, secret-free
  projections and locked draft preferences.
- `watch-session-final-production-build.log`: complete `pnpm build` passes,
  including i18n, current-batch and UI gates, server compilation and Next build.
- `watch-session-accepted-{seerrNGJ,seerrOrig,persiusNG}-browser.log`: two cases
  per theme at 390×900 and 1440×900. Actual isolated API session creation, invite
  generation, browser invitation acceptance, start and draft lock checks. Card
  metadata, ballot responses and matches are deterministic browser fixtures;
  provider security and policy are checked by the native API cases above.
- Screenshots compare create, draft and active states with matching baseline
  viewports/themes. Populated cards, want/pass controls, private choices and
  matches receive additional candidate captures. Browser exceptions and horizontal
  document overflow are checked. Screenshots scroll to the top before capture;
  fixed navigation overlays in full-page images retain their viewport position.
- `watch-session-final-lint.log`: focused ESLint passes. Full tooling passes: 353 tests,
  four platform skips and zero failures. Full native and browser CI must pass
  on the integration head before merge.

No live household data, live metadata provider mutations, real invitation delivery
or PostgreSQL runtime was exercised locally. Isolated SQLite fixtures prove the
API behavior; both database migration definitions are retained. CodeQL remains
disabled under the owner directive.
