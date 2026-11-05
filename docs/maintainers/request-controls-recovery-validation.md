# Request controls contribution recovery

Recovered original histories: #447 (destination defaults and provenance), #446
(bounded queue snapshots), and #491 (source-aware scan tag exclusions).

Review repairs include explicit SQL types for nullable destination defaults,
preservation of deliberately chosen defaults and profile zero, provider-page
validation before queue truncation, duplicate-ID rejection, and separate HTTP
and HTTPS scan policies. Disabled service aliases no longer suppress enabled
scanners. Excluded library reconciliation preserves pending, blocked and deleted
season states.

The shared Modal owner now lets only the front dialog handle outside-click
dismissal. Previously a portaled request editor's profile selector dismissed its
parent Manage Media dialog and both disappeared. Existing portal/listbox ownership
checks remain in place. No shared styles or control dimensions changed.

## Validation

- 389 native request, queue, scan and recovery checks passed before the final
  excluded-season repair; 64 scanner checks passed after that repair, including
  its new regression. These totals overlap.
- Three AdvancedRequester component checks passed, covering profile zero,
  unchanged saved values and intentional reselection of a service default.
- Production client and server builds passed after their respective changes.
- Eight headless Chromium checks passed: Radarr, Sonarr and Lidarr settings at
  1440x900 and 390x900, plus nested request editing at 1440x900 and 390x844.
  Queue bounds reject 9 and accept 1500; settings persist scan exclusions;
  nested profile selection and child-only dismissal preserve the parent.
- Matched baseline/candidate screenshots were inspected for settings and the
  shared Manage Media/request editor consumers. Existing control geometry,
  typography and responsive wrapping are retained; the new settings extend
  existing form rows. The phone profile menu stays inside the viewport.

Browser provider responses are controlled fixtures; these checks do not certify
every live Servarr installation. Evidence, including initial failing cases and
accepted screenshots, is retained in the contribution-recovery task artifacts
for 2026-11-05. Integration CI validates the combined head with current main.
