# SeerrNG PR #418 W3880-W3899 candidate-free input

This sealed input covers 20 English source messages and 240 current translation cells across the 12 direct locales. It contains current catalog strings, source and runtime pins, direct caller and route context, token diagnostics, and hash-only prior selection/hold/application continuity. It contains no current-window proposals, dispositions, rationales, or review text.

The PR was open and draft at exact head `39d8ae36ba757532f947a9a15be22f0676e79075` / tree `45e3ada0f565a07c675d1d75096f4266c4ef691e`, targeting `main` at `fa40534ccced75bde1125c14760514fcd5d7de4d`. Branch and PR refs matched before and after extraction. Exact-head deployment count was zero at both reads.

All 3,880 prior source positions and 136 prior applied target hashes were reattested by hashes; all 14 carried holds were reattested without exposing their strings. The 13 catalog key sets are parity-checked against English; insertion-order differences are reported separately.

Run `python3 verify-candidate-free.py --source-worktree /path/to/exact-head-worktree` before review.
