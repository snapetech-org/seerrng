# SeerrNG PR #418 primary semantic review: source positions 1900–1999

This packet reviews 100 English source entries across the 12 direct locales ar, de, es, fr, hi, id, ja, ko, pt_BR, vi, zh_Hans, and zh_Hant (1,200 cells).

## Pin and method

- PR #418 was OPEN/DRAFT at exact head `aab1928ff83728d30a864b1ff24c5c812c7ca040` and tree `00901677a18e5ebf8d92a1f195668289f8a6f928` before and after review.
- Source positions are zero-based insertion order in the pinned flat `src/i18n/locale/en.json` catalog.
- The packet reattests 100 source IDs, all 12 catalogs and 1,200 current cells, 382 caller line references across 8 files, and the live PR head.
- Historical scan found 365 overlapping rows, including prior machine-keep and candidate records. None supplies an exact prior final target hash for these current cells; they were all reviewed anew.
- 9 keys have only definition/single-reference evidence in the targeted caller files, covering 108 cells. Those rows retain `callerClaim: unclaimed`; no rendered-use claim is made.

## Review summary

- Accept current: 929
- Propose correction: 191
- Propose refinement: 80
- Holds: 0
- Exact-hash correction/refinement candidates: 271
- Candidate placeholder/ICU mismatches: 0
- Candidate markup mismatches: 0
- Candidate protected-literal mismatches: 0

The primary ledger records exact source/current/candidate/final text and hashes, locale/source catalog pins, caller lines, disposition, rationale, confidence, and placeholder/markup/protected-literal checks for every cell. The candidate targets are proposals pending independent cross-review. This is a machine semantic review, not native-speaker approval.

No repository or PR edits, tests, builds, scans, CI, or browser actions were performed for the packet. `SHA256SUMS` covers every packet file.
