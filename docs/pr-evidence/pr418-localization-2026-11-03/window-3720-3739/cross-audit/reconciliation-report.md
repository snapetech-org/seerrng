# SeerrNG PR #418 W3720-W3739 third-party cross-audit

Pinned at head 1ca6ec2d5a0e9ef8000c69997e75648a8ccaf06e and tree 6a51f3fb1d1f65c12bfe82bf47834626aa364488. The ledger includes all 240 cells, both review proposals and rationales, exact selected target hashes, source/caller evidence, and token/literal checks.

## Reconciliation

Primary counts: {'correction': 35, 'refinement': 16, 'accept-current': 189}. Blind counts: {'correction': 19, 'refinement': 9, 'accept-current': 212}. Cross counts: {'correction': 34, 'refinement': 16, 'accept-current': 190}.

The reviews differed on 46 target hashes and 28 dispositions. The cross-audit selects 50 exact-hash changes and retains 190 current values. Both reviews share 7 of the changed targets. Three target disagreements retain current values: de/3723, ar/3724, and id/3727.

All 12 callerless position-3632 holds remain carried forward by exact hash equality; this window adds no holds. Hindi 3724 current text omitted protected literal IP; the selected correction restores it. No selected placeholder, ICU category, markup, numeric, protected literal, named-brand, or localized Manage Requests label checks failed.

## Caller-based decisions

- Position 3720 preserves the difference between Kapowarr's automatic post-approval GetComics/mirror check and SeerrNG's separate manual Prowlarr search, including the exact localized Manage Requests label.
- Positions 3737 and 3738 refer to the caller's leading-slash rejection; 3739 refers to its trailing-slash rejection.
- The Indonesian 3727 proposal broadening Root Folder to main folder was not selected; the current root-folder wording is retained.

## Checks and limits

Candidate-free, primary, and blind packets and checksum manifests are included. The root verifier reruns nested checks against the pinned checkout. Before/after live attestations record OPEN/DRAFT, exact head/tree, branch and pull refs, and base-ref divergence. PR body was not edited. No repo/PR changes, tests, builds, scans, CI, browser review or workflow changes were performed. Qualified native-speaker review was not performed.
