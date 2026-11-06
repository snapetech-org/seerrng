# SeerrNG PR #418 parity cross-review: locale-c

This packet independently reviews 132 cells in Japanese, Korean, and Brazilian Portuguese against the current candidate-free source, target, and caller inputs plus the hash-reattested primary and blind proposals.

Exact pins: PR head f48afa55ce2abeb00ee8b2dc66fa6d2df8f62ba4, tree f7ea727b0383397ec8d6220667b4abe151d43b46; base main 2647e15762de0c2285cd9d8ebc6d27ffafce6358, tree b6f4acb9debdc1b0a838b50d5ad88aaa467e429b. Scope is 129 insertion gaps (43 source IDs × 3 locales) plus 3 existing-target refreshes for components.RequestModal.watchAheadActiveForRequest, totaling 132 cells. This lane is separate from the older W4000–W4019 cross-review.

Every source, target, and caller row was bound to the current candidate-free packet. Primary and blind candidate hashes were checked against hash-only reattestation rows before semantic review. The two Japanese blind numeric scanner differences were reviewed individually. Their numeric forms are equivalent to the English number words, but the exact recommendations use Japanese number words and preserve the source numeric-token inventory. Recommended wording passes placeholder, ICU, numeric, markup, inline-code, and protected-literal checks.

The ledger records exact targets, candidate/current/source/caller hashes, the changed-source refresh category, rationale, confidence, and caller roles. It contains no holds. No native-speaker or headed-browser review is claimed.

Portable verifier command:

    PYTHONDONTWRITEBYTECODE=1 python3 verify_cross_review.py

Exact Git readback command:

    PYTHONDONTWRITEBYTECODE=1 python3 verify_cross_review.py --repo /mnt/disks/scratch/task-worktrees/localization-20261105/seerrng-pr418-resume

The portable verifier makes no network requests. No repository or PR files were edited, and no tests, builds, scans, CI jobs, workflow changes, releases, or tags were run.
