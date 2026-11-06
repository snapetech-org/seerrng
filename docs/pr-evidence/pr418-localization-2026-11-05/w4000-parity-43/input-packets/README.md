# SeerrNG PR #418 post-W4000 parity review inputs

This packet reopens the separate 528-cell catalog-parity audit after the W4000–W4019 translation window was applied. It does not reuse the stale W4000 cross ledger.

## Exact current candidate-free packet

- Current PR head: `f48afa55ce2abeb00ee8b2dc66fa6d2df8f62ba4`
- Tree: `f7ea727b0383397ec8d6220667b4abe151d43b46`
- Base: `2647e15762de0c2285cd9d8ebc6d27ffafce6358`
- Scope: 43 missing source IDs × 12 locales (516 insertions), plus 12 existing cells for one changed English value (refresh), totaling 528 cells.
- Candidate-free exact-Git verifier passed against the Seerr worktree.

`candidate-free/` contains the full current source order, catalog and caller pins, all 528 exact target states, and the 44 caller contexts. The source text and caller locations are pinned to the current PR head.

## Prior review lanes and current-head reattestation

The complete primary and blind candidate packets remain intact under `primary-review-old-head/` and `blind-review-old-head/`. Both were originally sealed at head `77d30ae742aad7245e6e419237fca6a544531e1f` / tree `2c6fe4a0c1c33aa56b01f06a70702f68598509a7`.

`reattestation/` proves that all 528 source text hashes, 528 current-target hashes, 44 caller-context hashes, and both lanes’ 528 proposal hashes still bind to the fresh packet. No source or target cell drifted. The 12 target catalog file blobs changed because W4000 updated those files, while the 44 parity IDs remain disjoint from that window.

A stricter numeric scanner flags two Japanese candidate forms that spell source number words with Arabic digits: `components.CollectionQueue.description::ja` and `components.Settings.analyzeOnPlaybackTip::ja`. The sealed primary and blind records claim token checks passed. Cross review must judge these exact semantic equivalents and record its decision; do not treat the scanner result as an automatic failure.

## Cross-review handoff

Read `candidate-free/README.md` and the current-head reattestation summary before reviewing candidate text. Use the original primary and blind ledgers/proposals only after validating the corresponding hash-only reattestation rows. Review by exact cell ID, source/caller context, locale, and current target state. The candidate-free packet is the source of current values; old lane records supply candidate wording only.

This packet contains review inputs, not a cross-review decision or an application plan. No catalog or PR file was edited by this packet. Native-speaker and headed-browser approval are not claimed. No tests, builds, scans, CI, workflow changes, releases, or tags were made.
