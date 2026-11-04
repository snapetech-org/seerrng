# SeerrNG PR #418 W3860–W3879 independent cross review

This sealed, read-only packet adjudicates all 240 cells from the candidate-free input and reconciles the 16 primary proposals with the 35 sealed blind proposals. It is pinned to PR #418 head `12bb562dc0eb27165cc2c6fbd1ff2628d5f8574e`, tree `b288494aa5a0842affc4e900d6ccb6b57d99c493`, targeting `main` at `fa40534ccced75bde1125c14760514fcd5d7de4d`.

## Decision counts

- 204 current targets retained.
- 36 exact primary or blind proposal targets selected.
- The review packets contain a 36-cell proposal union: 7 exact target agreements, 8 cells with different primary and blind targets, 1 primary-only proposal, and 20 blind-only proposals.
- Of the 8 differing-target cells, the cross review selects the exact blind proposal for 6 and the exact primary proposal for 2. Proposal strings and target hashes remain linked in `proposal-reconciliation.jsonl`; the 8 resolutions are also in `proposal-disagreements.jsonl`.
- No new hash-only holds were needed. The 14 prior hash-only holds remain represented only by hashes in the candidate-free input and are reattested there.
- The two baseline protected-literal mismatches are corrected in the selected targets: Japanese preserves `Navidrome`, and German preserves the distinct `HTTP`, `HTTPS`, and `URL` terms.
- The Apprise “Configuration Key” targets are changed to the locale-specific “Configuration Name” proposals because adjacent caller/help context defines the field as a saved configuration name. No English source change is made or applied.

## Verification and scope

The candidate-free checksum and verifier passed against a temporary exact-head worktree, including all pinned source catalog bytes; that worktree was removed after verification. The primary-review and blind-review checksums and verifiers passed. Live PR, branch, and pull refs were reattested before and after the cross review; both snapshots retain the exact pinned head/tree and zero deployments at that head.

Run `python3 verify_cross_review.py` from this directory for the portable packet verifier. It checks all nested and root checksums, input packet linkage, each cell’s source/current/caller hashes, exact proposal linkage, all decisions and proposal disagreements, prior hold continuity, and both live PR snapshots.

This is a static machine cross review with moderate confidence. It does not claim native-speaker or browser approval. No Seerr source, catalog, or PR content was changed, and no tests, builds, scans, CI, or workflow actions were run.
