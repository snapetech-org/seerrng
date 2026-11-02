# SeerrNG W1900–1999 exact-hash application

Applied reviewed changes for source positions 1900–1999 at PR #418 input head `aab1928ff83728d30a864b1ff24c5c812c7ca040` (tree `00901677a18e5ebf8d92a1f195668289f8a6f928`).

## Review outcome

Primary review and independent cross-review cover 1,200 cells across 100 source IDs and 12 direct locales. They reattested 382 caller references in eight files. Placeholder, markup, protected-literal, and final ICU validation passed; Arabic plural targets retain zero/one/two/few/many/other forms.

The primary review proposed 271 corrections or refinements. The independent review accepted those and found nine additional issues. Root adjudication accepted eight of the additional proposals and refined one Simplified Chinese explanation to match the existing button labels exactly. Final dispositions are 920 accept-current, 198 corrections, 82 refinements, and zero holds. Applied 280 exact-hash updates across the 12 locale catalogs.

Nine keys (108 cells) have definition-only or single-reference evidence and remain explicitly unclaimed as rendered use. Twenty-five of the applied proposal cells are in that unclaimed group; the review records them without asserting that those keys render.

## Files

- `primary/`: checksummed primary review packet.
- `crossreview/`: checksummed independent 1,200-cell ledger and its nine findings.
- `application/root-adjudication.jsonl`: primary adjudication of the nine new cross-review findings.
- `application/apply_exact_hash.py`: exact-head, exact-current-hash guarded applier.
- `application/apply-plan.jsonl`: all 280 approved changes, expected old and new hashes, and caller-claim status.
- `application/readback.json`: catalog counts and post-write readback summary.

All 12 target catalogs retain 9,494 keys and the exact target values read back. No tests, builds, scans, CI jobs, browser actions, workflow changes, merges, releases, or tags were performed. Current-head browser review and qualified native-speaker review remain outstanding; machine review is not native-speaker approval.
