# SeerrNG PR #418 primary semantic review: W2300–2399

This packet reviews 100 English catalog entries across the 12 direct locales (ar, de, es, fr, hi, id, ja, ko, pt_BR, vi, zh_Hans, zh_Hant): 1,200 locale cells.

## Exact input pin

PR #418 was OPEN/DRAFT at head d49b44895d0ded9796f0c970ad09141212e9a98f, tree cebcfc11e0ea37c42f5b6e979e96cca8c89c7814. The GitHub API, remote branch, and provided worktree were rechecked before and after review; the worktree was clean. Source positions are zero-based insertion order in `src/i18n/locale/en.json`. This window begins at 2300 (`components.NotificationTypeSelector.mediaavailableDescription`) and ends at 2399 (`components.PermissionEdit.autoapproveSportsDescription`); the next key at 2400 is `components.PermissionEdit.autorequest`. The W2200–2299 final-target readback at d49 is detailed in `previous-window-readback.json`. The frozen cell ledger includes source and current-target hashes, catalog pins, and caller-context hashes.

The review proposes 169 corrections and 0 refinements, accepts 1031 current values, and has 0 holds. Exact prior rows with source and final target matching the live catalog: 0. The broad W700–749 planning packet contained 1200 preliminary cell rows (1198 marked semantic-review-required and 2 marked reuse-equivalence-decision); none had an exact current final-target match, so they were not treated as completed reviews. The W2200–2299 final-target readback at d49 is detailed in `previous-window-readback.json`.

## Caller evidence and integrity

Pinned caller evidence has 340 line references across 5 source files for all 100 source IDs. No source lacks a pinned line reference. 1 key has only definition/single-reference evidence: components.PatchProjects.PatchDiscovery.loadMore. Those limits are retained in `caller-contexts.jsonl` and should be considered during independent review.

Current/final placeholder mismatches: 0/0. Current/final markup mismatches: 0/0. Source ICU plural/select entries: 1. Current/final protected-literal mismatch cells: 11/0. Protected-literal mismatches are recorded per cell in the ledger; product names and format acronyms are preserved in candidate targets.

## Packet contents and limits

- `primary-review-ledger.jsonl`: one decision per locale cell, exact current/final values and hashes, caller context, rationale, confidence, and integrity checks.
- `correction-candidates.jsonl`, `candidate-targets.json`, `review-plan.json`, and `primary-candidates.json`: proposed target text, hashes, dispositions, and rationale.
- No independent per-locale language audit was available for this window; native-speaker review is still outstanding.
- `source-window.json`, `source-current-cells.jsonl`, `caller-contexts.jsonl`, `prior-disposition-boundary.json`, `previous-window-readback.json`, and `input-manifest.json`: frozen inputs and provenance.
- `final-reattestation.json`: final PR/ref/worktree check.
- `INPUT-SHA256SUMS` and `SHA256SUMS`: input and packet checksums.


Native-speaker approval remains outstanding. This is a primary semantic review, not native-speaker approval. No repository files or workflows were changed; no test/build/CI tasks or browser activity were run.
