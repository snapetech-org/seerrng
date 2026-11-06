# SeerrNG PR #418 localization review: W4000–W4019

This packet contains a freshly reattested review of 20 selected English message IDs and their 12 direct locale cells (240 cells). The 20 IDs were originally ranked W4000–W4019; 37 newer English IDs shifted them to current positions W4037–W4056. This window is separate from the 44-source parity refresh and its 528 cells.

## Exact review input

- PR head before application: `77d30ae742aad7245e6e419237fca6a544531e1f`
- Tree: `2c6fe4a0c1c33aa56b01f06a70702f68598509a7`
- Base: `2647e15762de0c2285cd9d8ebc6d27ffafce6358`
- Product commit applying the adjudicated cells: `e27337742b8e0f7926d18bbb766df3e6ce909527`
- Product tree: `fa183151152695a0038f44036d4fccc32029af62`

The candidate-free packet pins all selected English text, 240 current catalog values, caller contexts, catalog blobs, token diagnostics, and source order. Primary and blind reviewers each reattested all 240 source, target, and caller hashes against the fresh packet. Exact-Git and portable cross-review verification passed.

## Review and application result

The 240-cell cross ledger contains 215 accepts, 13 wording adjustments, and 12 text-free holds for the shared `Enable Agent` label. The cross ledger proposed 50 textual changes. Root review accepted those changes and resolved the 12 holds from the exact checkbox caller plus the same page’s `components.Settings.notificationAgentSettingsDescription`, which identifies these controls as notification agents or services. The 12 locale-specific choices and their rationale are recorded in `root-review/root-adjudication.jsonl`.

The application changed 62 catalog cells across the 12 direct locale files and retained 178 current values. The 62 comprise the 50 cross-reviewed target changes and 12 context-resolved agent labels. Exact-hash readback verified all 240 cells, only the 12 locale catalogs changed, all other values were preserved, and existing key order remained intact. `git diff --check` passed.

The root override is grounded in the UI’s notification settings context; it is still machine review. This packet does not claim qualified native-speaker approval or headed-browser acceptance. No test, build, scan, or CI job was run. No workflow file was changed.

## Packet contents

- `candidate-free/`: fresh 240-cell input and exact source/caller/catalog pins.
- `primary-review/`: independent primary decisions and proposal ledger.
- `blind-review/`: independently sealed blind decisions.
- `cross-review/`: 240-cell reconciliation and exact-head verifier.
- `root-review/`: manual adjudication, exact-hash application manifest, and readback verifier.
- `SHA256SUMS.txt`: aggregate checksums for this evidence bundle.

Run the cross verifier from `cross-review/` with `../candidate-free`, `../primary-review`, and `../blind-review`. Pass the exact source worktree with `--repo` to verify Git objects. Run the root readback verifier from `root-review/` with the same worktree path.
