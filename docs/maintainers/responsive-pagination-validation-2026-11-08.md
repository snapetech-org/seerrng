# Shared pagination recovery — November 8

Issue [#608](https://github.com/snapetech-org/seerrng/issues/608) records a layout
failure found while visually inspecting the otherwise successful request-count
checks. At phone widths, the page indicator overlaps Previous. This was not an
API or request-count failure.

The semantic owner is PaginationFooter and its existing pagination-footer CSS
family in globals.css. Its three-column grid allowed both outside tracks to
shrink to zero underneath content-sized controls. The six consumers are current
Requests, legacy user requests, Issues, Blocklist, Settings Logs and software
requests. No theme package overrides this owner.

The owner now stacks its groups below 640px. Desktop retains its existing balanced
three-column arrangement. Pinned upstream Seerr v3.5.1 source
564bfb08b54caa374bddaf820abfd226e5e69151, RequestList/index.tsx, already uses a
vertical pagination arrangement below that breakpoint. The native page indicator
remains between the existing groups. John retains its own compact buttons,
selects, fonts and surfaces. No new CSS family, page override, dimension, colour,
button size, gap or margin is introduced.

## Qualification

- Baseline: frozen production app from acd7fc057, port 55192. Its shared CSS owner
  is unchanged from stable23. Candidate: isolated pagination worktree/config,
  port 55196, full production build. Both use the actual shared components and
  compiled styles. Paged API responses are explicit replays for layout and
  callback checks; these are not provider-pagination or acquisition tests.
- Baseline matrix: 24 geometry failures, one for each of six consumers in Orig
  and John at 320/390px. The remaining 36 cases pass at 639/640/1440px.
- Candidate: all 60 maintained browser cases pass across both themes, all six
  consumers and 320/390/639/640/1440px. They reject overlapping/out-of-bounds
  regions, verify the phone flow, and click Next/Previous. Desktop cases also
  change the page size; the software footer intentionally retains its sole 20
  option. No request or provider mutation occurs.
- Two further 390px Arabic cases pass with the actual saved locale and theme.
  Desktop 1440px baseline/candidate checks both pass, and the complete measured
  footer/control rectangles are exactly equal in each theme. Orig buttons
  remain 30px tall and John buttons 24px tall in these states.
- Matching phone footer captures for every consumer and both themes were
  visually inspected for control geometry, spacing, typography, surfaces,
  alignment and collisions. The page indicator is now readable and separate.
  Desktop and breakpoint geometry checks remain green. Physical devices,
  all translations and every possible application state are not claimed.
- Production compilation/typecheck/lint and prebuild i18n/shared contracts pass.
  The release-note fragment parses. The change is not published at this source
  checkpoint, and #608 stays open pending final CI and artifact verification.

Evidence on kspld0:
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/`
contains pagination608-baseline/candidate matrices, comparison captures, the
Arabic checks, exact desktop geometry JSON and build logs. Source acceptance is
separate from release acceptance. Other unfinished issue paths remain open.
