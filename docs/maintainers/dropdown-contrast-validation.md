# Shared dropdown contrast repair

Issue #373's original screenshot shows pale option text on a white menu. The
unselected menu already uses the matching theme surface. Current rendered QA
found two remaining gaps: white focused text on Lagoon's 600 accent has only
3.744:1 contrast, and an unlayered library default overrides the layered dark
request-tag trigger surface, rendering it white.

The shared React Select owner now uses the existing 700 accent for focused and
selected options. Its control surface, border and text retain the authored theme
tokens with sufficient cascade priority against library styles. The redundant
higher-specificity compact-filter state override is removed so request tags and
other compact consumers inherit the same owner. No geometry, theme anchors,
component-local CSS or Tailwind utilities are added. The current-batch contract
now requires that shared selected owner and rejects the competing compact rule.

## Validation and evidence

Evidence lives in
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`.

- `issue-373-contrast-baseline.log`: all12Lagoon focus checks fail across the3
  interfaces, light/dark modes and390/1440widths.
- `issue-373-trigger-baseline.log`: the actual book request-tag trigger renders
  white in the dark theme before the cascade correction.
- `issue-373-trigger-candidate-build.log`: production build passes, including
  the existing i18n and UI build guards.
- `issue-373-final-browser.log`: all68production browser cases pass. Settings
  options meet4.5:1 across23built-in palettes in both modes; Lagoon also covers
  all3interfaces at390/1440. Twelve book request cases cover3interfaces,
  English/Arabic and390/1440, including actual compact dark tag options,
  nonwhite dark triggers, disclosure interactions and zero request submissions.
- `issue-373-shared-owner-contracts.log`:46existing source-contract cases pass.
  Matching phone and desktop light-mode comparisons were visually inspected;
  initial tag screenshots exposed the white-trigger gap and prompted its fix.
  Final tag captures are retained in `issue-373-final-browser/`.

The tests use isolated runtime55141 and deterministic catalog/service fixtures.
They do not save service configuration or submit acquisitions. Browser testing
uses Linux Chromium; Windows/Firefox and arbitrary user-authored color overrides
are not claimed. The independently maintained opt-in Visual Lab reference is
outside this production-owner change.

The expanded style sweep separately found16pre-existing failures out of449checks.
Identical failures reproduce on the unchanged integration baseline in
`preexisting-style-sweep-baseline.log`; candidate evidence is in
`issue-373-all-style-regressions.log`. Their test/owner repair and CI discovery
work is tracked separately and is not represented as passing here.
