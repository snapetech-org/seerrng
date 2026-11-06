# SeerrNG PR #418 primary semantic review: W2500–2599

Reviewed SeerrNG PR #418 at exact head `0905d4be32d8b7ec3b1af701473a3fdf6e0f30a2` and tree `a09117211080bbd89d32959f17d93b02a82b966f`. The scope is positions 2500–2599, zero-based English-catalog insertion order, 100 source IDs × 12 locales = 1,200 cells. The adjacent boundary keys and the exact source catalog hashes are in `source-boundaries.json` and `source-window.json`. This window starts immediately after W2400–2499 at position 2500; the next key is position 2600.

The primary review proposes 475 corrections, accepts 725 current strings, and holds 0 cells. Per-locale totals and integrity counts are in `summary.json`. All cells have source/current string hashes, locale-catalog pins, caller-context hashes and exact line references. All 100 source IDs have direct-or-helper references in the pinned caller files; the ledger records the bounded search note and each reference.

Current placeholder mismatches: 0; current markup mismatches: 0; current protected-literal mismatch cells: 34. Final proposed/accepted targets have placeholder mismatches: 0; markup mismatches: 0; protected-literal mismatches: 0. Source ICU plural branches are preserved; locale-specific additional plural categories are permitted. Locale key-set parity is True.

Batch 03 received an independent 300-cell cross-review: {'agree': 264, 'revise': 36}. The primary reviewer adjudicated all 36 revise recommendations as corrections after checking source and caller context and validating placeholders, markup, protected literals, and ICU branches. The complete independent ledger and primary adjudication are `batch-03-crossreview.jsonl` and `batch-03-crossreview-adjudication.jsonl`.

All seven localization PR/repo state snapshots are in `live-localization-prs-start.json` and `live-localization-prs-end.json`. Seerr #418 remained at the requested exact head/tree and the worktree remained clean through final reattestation: True. Other PR head/state changes from the start snapshot, if any, are recorded in the end snapshot. Prior packets were scanned for exact live source+final-target dispositions; 0 exact dispositions were reused.

This is a static, machine-assisted primary review. It is not native-speaker approval; native-speaker review remains outstanding. No repository or PR files were edited, and no tests, builds, scans, CI jobs, or browser work were performed.

## Files

- `primary-review-ledger.jsonl`: one full-pinned primary decision per locale cell.
- `correction-candidates.jsonl`, `candidate-targets.json`, `review-plan.json`: proposed corrections and exact hashes.
- `source-current-cells.jsonl`, `caller-contexts.jsonl`, `source-window.json`, `source-boundaries.json`: frozen exact-head inputs and caller evidence.
- `batch-01-review.jsonl` through `batch-04-review.jsonl`: reviewer judgments by locale batch.
- `batch-03-crossreview.jsonl`, `batch-03-crossreview-adjudication.jsonl`: independent review of batch 03 and primary adjudication of its recommendations.
- `live-localization-prs-start.json`, `live-localization-prs-end.json`, `final-reattestation.json`: before/after PR and worktree state.
- `SHA256SUMS`: checksums for every file in this task packet (except the checksum file itself and its detached `.sha256`).
