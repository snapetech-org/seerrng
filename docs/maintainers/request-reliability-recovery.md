# Request reliability contribution recovery

Preserve the original histories from PRs #495, #486, #448, #441, #436, #435,
#445 and #483. The combined recovery keeps requests without linked media from
breaking reconciliation, retries transient Radarr/Sonarr dispatch failures, fails
missing default service destinations promptly, avoids multiplied season rows and
redundant detail fetches, completes already available media without redispatch,
loads issue-comment reporter settings, and preserves SeerrNG history when removing
provider copies.

The repairs retain the existing subscriber method owner and update assertions to
the intended missing-service behavior. Error-cause traversal is bounded and
cycle-safe. Added tests exercise both Radarr and Sonarr transient/cyclic failures,
transactional completion, reporter settings, and real browser deletion behavior.

Validation on 2026-11-05:

- Eighty-six combined backend checks pass; the additional issue-comment reporter
  settings regression passes with its two existing notification-intent checks.
- Full server/client production build, subsequent client build for the provider
  deletion change, server type checking and changed-source lint pass.
- A running-app browser regression passes at 1440×900 and 390×900. The baseline
  demonstrates duplicate detail reads and the second destructive metadata DELETE;
  the candidate makes no initial/focus detail reads and deletes only the provider
  file. Both captures retain the request row. API responses use isolated fixtures.
- Request-list presentation owners and CSS are unchanged. Matching baseline and
  candidate row captures verify the shared controls, title, status, spacing,
  surfaces, alignment and narrow layout.

Evidence lives at
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`
in `backend-*` logs, screenshots and traces. Headless browser QA was authorized;
these checks do not establish live provider behavior against real libraries.
