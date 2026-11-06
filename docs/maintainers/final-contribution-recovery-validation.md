# Request policy, automatic genres and TMDB follow recovery

Original histories for PRs #453, #466, #469, #474 and #492 are preserved in
`codex/recover-final-features-20261105`. They are not replacements for one another:
requester tags update an existing available service item, automatic genres extend
blocklisting, streaming policy uses a user's regional subscriptions, TMDB follows
produce private title updates, and responsive fixes retain existing theme owners.

## Repairs and security boundaries

Requester-tag requests require exact service/quality availability and enabled
requester tags. TV requires all regular seasons. The server verifies the existing
provider identity, files and seasons, writes only `applyTags: add` through the
provider's item editor, then verifies readback. Failures cannot fall into ordinary
acquisition. Service ID zero remains valid. Existing approval, quota and destination
rules remain in force; tag-only requests omit acquisition overrides and episode queues.

Streaming policy only uses regional flat-rate availability. Missing regional
metadata follows ordinary request rules. Explicit own-user overrides require
administrator permission to offer that override. Policy approval cannot bypass
quota approval. Movie and TV dialogs retain typed rejection feedback and an explicit
retry action with a strict boolean override.

Automatic blocklisting handles keywords, movie genres and TV genres independently.
Manual entries survive automatic reconciliation. Removing one matching source keeps
an entry; removing every source restores its prior media status without deleting
its media identity. Settings and source lists are bounded; settings require ADMIN.

TMDB generation originally ignored global age gates without individual caps, trusted
mismatched identities and failed to recheck saved pending titles. The shared video
policy now reloads the viewer's current category and age settings on generation and
feed reads, with bounded metadata concurrency. Unavailable transient metadata retries
without consuming the generation cursor. Policy changes hide feed items without
destructively deleting stored events. Nonmember administrators cannot read another
user's feed. Non-unique persistence failures propagate for retry; duplicate events
are consumed only after confirming the matching stored row.

The Following page originally increased `take` beyond the API's maximum and could
never retrieve event 101. It now requests bounded 30-row pages with offsets, merges
by event identity, and exposes retryable fetch errors while retaining cached content.

## UI ownership and evidence

The UI style standard and fix-it runbook govern this work. Follow cards reuse
refreshed surfaces, card stacks and page-content flow. Genre selectors retain the
shared settings focus owner. Compact tag and genre badges share the existing badge
geometry with a reusable `blocklist-source-badge` content owner. The unreferenced
legacy BlocklistBlock component was removed after tracing all consumers. No theme
CSS was changed. Old responsive history's duplicate OpenAPI definitions and duplicate
phone-layout test were reconciled against the richer current definitions.

Evidence root:
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`.
Baseline and candidate captures cover `/settings/main`, `/blocklist` and `/following`
at 390×900 and 1440×900 in seerrNGJ, seerrOrig and persiusNG. Six paired visual-review
montages were inspected for spacing, surfaces, typography, controls and overflow.
The six tag-badge computed-geometry comparisons are identical. Following's padding
and section gaps now come from existing shared owners; its added TMDB metadata wraps
within cards. Full-page captures preserve fixed navigation at its viewport position.
Legacy Orig poster overlap appears in both baseline and candidate and is separate
from the new source badges.

## Validation

- Full `pnpm build` passes, including i18n, current-batch and UI prebuild gates.
  `final-features-accepted-production-build.log`.
- Native integration: 297 passing tests and one stale theme fixture expecting two
  built-in themes. Corrected to the existing three; all three theme API cases pass.
- Tooling: 356 pass, four platform skips, zero failures.
- Four requester-tag admission cases and four provider editor boundary cases pass.
- Seven streaming-policy admission cases pass, including quota preservation.
- Eight automatic blocklist processor cases pass, including mixed sources and
  manual collisions.
- Fourteen follow policy, private-feed and persistence cases pass. Baseline logs
  retain the reproduced failures. Browser pagination reaches event 101 and retry
  recovers a failed feed.
- Exact issue #413 scene-detail service-zero regression passes; the production
  source is already identical in v3.72.9 and current main.

Movie and TV request dialogs pass tag-only service-zero submission and explicit
streaming-rejection override at both widths. Own-user provider selections retain
independent movie and TV providers. The first harness runs had incomplete fixtures:
TV lacked TVDB identity and season metadata; button selectors assumed exact labels
without format suffixes, TV fixtures accidentally included movie-only title fields,
and the tag-only season payload was incorrectly expected
to be an array rather than the documented `all`. Corrected fixture runs retain the
real UI controls and pass without production-source changes.

Visual review also reproduced a misleading future-season acquisition toggle in the
Persius tag-only TV dialog. Tag-only mode now omits that control; the ordinary request
toggle is preserved. A second rendered check found an empty duplicate acquisition
disclosure in the same mode; tag-only requests now omit the entire empty options
section. Both assertions fail against their respective prior builds and pass on
the final candidate. The new browser assertion fails against the prior production
build and passes after rebuilding. `final-features-tag-disclosure-production-build.log`
records the complete final accepted build; `final-features-final-accepted-*-browser.log`
records ten request/provider cases per theme. Full repository formatting, ESLint/Next
lint and server/client typechecks pass. The hosted formatting gate found two
previously committed files omitted from the focused formatter check; both were
formatted and the full formatting check then passed. A direct startup attempt against the
seeded fixture database tried production migrations; it was stopped by the existing
schema and replaced with the documented `pnpm cypress:start` fixture launcher,
which skips migrations and enables the offline network guard. No live configuration
or database was used.

Full integration-head CI is required before merge. Browser metadata and provider
mutations are intercepted fixtures; no live household provider mutations or live
PostgreSQL validation are claimed. CodeQL remains disabled under the owner directive;
historical findings remain in the separate security ledger.

## Settings submission regression found by complete Cypress

The complete Cypress suite passed200 cases with32 pending and found one actual
form regression: `rejectionMessage` was marked required even though its documented
default is empty and the message is optional. This blocked unrelated settings saves
while policy was disabled, as well as an enabled policy using its default message.
The schema now retains the1000-character bound and accepts an empty message. Two
headless baseline cases fail before the repair and pass after the complete production
build. The existing strict application-URL and permissive trailing-slash YouTube URL
validation is preserved. Logs: `final-features-optional-message-{baseline,accepted}.log`
and `final-features-optional-message-production-build.log`.
