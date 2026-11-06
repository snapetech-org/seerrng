# Native JavaScript test discovery recovery

The default native runner discovered only `.test.ts` files. Build guards ran a
small explicit style subset; other source-owned `.test.mjs` files were not part
of the full native CI gate. Explicitly running the broader style set on the
unchanged integration head reproduced433passes and16failures across449checks.

Discovery now includes TypeScript and JavaScript native tests under both server
and client source roots, retaining the existing Vitest-owner exclusion. `--list`
prints the selected files without starting fixtures or running tests. Regression
checks require known style owners, uniqueness, Vitest exclusion, and exact
explicit-file selection. The current inventory contains592files including63MJS
owners; these counts describe this revision, not a fixed discovery limit.

## Repairs

The failing checks were traced to their current production owners before repair:

- Default theme spacing now ignores nested responsive overrides when evaluating
  the package's base values; existing narrow-screen values are preserved.
- Divider and radius checks follow shared aliases and selected theme packages.
  Persius retains its existing1pxdivider; original interfaces retain2px.
- Paired table checks retain shared subgrid tracks without demanding an obsolete
  explicit zero-padding declaration on a naturally unpadded wrapper.
- Supplemental-details checks inspect the actual JSX section, excluding later
  conditional summary branches. Movie ordering follows its reused extras node.
- Pin-border checks use logical inline-end ownership, preserving RTL behavior.
- Request-list checks resolve source-backed option arrays, including their
  video-only metadata sort gate, effective state and targeted-user callbacks.
- TV submission remains disabled both when the request is ineligible and while
  submission is active. Neither guard is removed.
- Watchlist fixtures include the current interface hook and retain real mounted
  double-click, failed/malformed response and confirmed-result assertions.
- The standalone comparison's embedded theme styles are regenerated with the
  existing repository script. Application CSS values are unchanged by this
  coverage repair.

## Validation

Retained evidence directory:
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`.

- `preexisting-style-sweep-baseline.log` and
  `issue-373-all-style-regressions.log` reproduce the same16failure owners before
  and after the independent dropdown patch.
- `style-coverage-full-candidate.log`:454style/discovery checks pass, including
  retained negative mutation guards and newly reachable Watchlist assertions.
- `native-discovery-additional-mjs.log`:48additional discovered MJS checks pass.
- `native-discovery-restored-files.json`: actual default inventory.
- `style-coverage-comparison-artifact-repair.log`: all4comparison/profile checks
  pass after regeneration. Matching1440and390screenshots were captured before
  and after, with desktop and narrow contact sheets inspected. The comparison
  remains a desktop reference; its existing cramped mobile sidebar example is
  unchanged and is not application mobile acceptance.

These source and fixture checks complement browser acceptance; they do not
establish physical-device, live-provider or native-speaker verification. Full
combined hosted validation remains required before final integration.
