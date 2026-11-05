# Account cache boundary validation (2026-11-05)

The core app retained its global SWR cache across client-side logout/login
navigation. A shared-browser reproduction populated the administrator's Issues
list, signed out through the real UI, then signed in as a regular account with
permission to create its own issues. Holding that account's issue-list response
proved the previous account's confidential comment remained visible from cache.
Server authorization was not bypassed in this reproduction.

Logout and successful login now create new documents. This discards the old
in-memory cache and pending requests rather than trying to selectively mutate
individual API keys. Existing safe-return-path validation, query/fragment
handling, native session clearing and push-subscription cleanup remain in place.

Headless Chromium reproduces the stale comment on the baseline at 1440×900 and
390×900. The candidate verifies a new document at both authentication boundaries,
no previous comment while the second account's response is held, and an empty
list after its response arrives. Test accounts and provider/API fixtures are
isolated; no real user data appears in the evidence.

The owner Issues and Login states were rendered at matching viewports. Phone
owner-list screenshots match exactly; login differences are the top three-pixel
navigation progress indicator. Desktop owner-list dynamic avatar/creator-content
rendering differs. Auth control and page layout owners are unchanged; the
intended second-account state changes from the leaked row to its empty list.

Production build, server/client typechecks, changed-file lint, and five safe
return-path tests pass. Screenshots, traces and logs are retained under
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`.
