# SeerrNG PR #418 independent blind cross-review, W3120–W3139

Independent machine-assisted semantic review of 20 source IDs and 240 cells across 12 locales at exact head `ebebae19e24b9236192eda287938b65eabf29667` / tree `8e5ef5985dee40f5c1191dff794e323a851d3ef8`. The PR and remote branch were rechecked at that head. The primary packet checksum list passed in full. Source order, current targets, all 271 caller lines, placeholder multisets, and markup were reattested against the exact pinned commit. The local worktree was clean and one local commit ahead of the PR branch; the reviewed values matched the exact pinned commit.

## Independent verdicts

- 173 accept-current, 40 corrections, 27 refinements, and 0 holds.
- All 240 rows in `blind-review-decisions.jsonl` record the exact source/current target, source and target hashes, disposition, final target and hash, caller evidence, and concise rationale. The ledger was completed before reading primary decisions or proposals.
- All proposed targets preserve placeholder multisets and markup. No placeholder or markup mismatches were found.
- Caller evidence confirms `runtime` is a media duration formatted in minutes. Indonesian, Japanese, and Chinese labels should use media-duration wording rather than computing-runtime wording.
- `requestfrom` has materially incorrect Arabic, Hindi, Indonesian, Japanese, and Vietnamese current values in its pending-approval context.

## Comparison with primary review

- Primary decisions: 185 accept-current, 39 corrections, 16 refinements, 0 holds; 55 candidate proposals.
- Exact agreement on disposition and final target: 190/240 cells. Two use the same target with different disposition labels; 48 have different final targets.
- The independent review proposed 67 changes. Candidate sets overlap on 48 cells (26 identical targets and 22 different targets); 19 independent candidates were absent from the primary proposal set, and 7 primary proposals were not proposed independently. The comparison ledger includes exact targets and SHA-256 hashes plus both rationales for each cell with a verdict or target difference.
- See `comparison-summary.json` for counts and `blind-vs-primary-differences.jsonl` for the cell-by-cell divergences. `candidate-proposals.json` was checked against all 55 primary non-current decisions: keys and targets match exactly.

This is a machine-assisted semantic review and does not claim native-speaker approval. No repository edits, tests, builds, scans, browser actions, CI, workflow edits, commits, or PR updates were made. See `manifest.json` for pinned input hashes and review sequence. All report artifacts listed in `SHA256SUMS.txt` are checksummed.
