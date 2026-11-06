# SeerrNG PR #418 primary semantic review: W2400–2499

This packet reviews 100 English catalog entries across the 12 direct locales (ar, de, es, fr, hi, id, ja, ko, pt_BR, vi, zh_Hans, zh_Hant): 1,200 locale cells.

## Exact input pin

PR #418 was OPEN/DRAFT at head f20893e57a89827095fa049d8e0475df7ec7170f, tree b5a5952fb4f8a37ea5a39286295f153ce9504f52. The GitHub API, remote branch, and provided worktree were rechecked before and after review; the worktree was clean. Source positions are zero-based insertion order in `src/i18n/locale/en.json`. This window begins at 2400 (`components.PermissionEdit.autorequest`) and ends at 2499 (`components.ReaderDeliveryLink.comicsGrimmoryHelp`). Boundary keys at 2399 and 2500 are listed in `source-boundaries.json`. The frozen cell ledger includes source and current-target hashes, catalog pins, and caller-context hashes. All 12 locales have the exact 9,494-key set. ja, ko, vi, zh_Hans, and zh_Hant have key-order differences starting at zero-based position 350; the window cells are joined by source ID, while the review positions are derived only from English insertion order. The pre-review and final seven-PR state snapshots are in `live-localization-prs-start.json` and `live-localization-prs.json`.

The review proposes 347 corrections and 0 refinements, accepts 853 current values, and has 0 holds. Of these proposals, 199 were primary candidates across nine locales and 148 were independently reviewed hi/id/vi proposals after three no-op rows were revised to accept-current. Exact prior rows with source and final target matching the live catalog: 0. Prior packet rows were scanned but none had an exact current final-target match for this window; no prior dispositions were reused.

## Caller evidence and integrity

Pinned caller evidence has 262 line references across 4 source files for all 100 source IDs. No source lacks a pinned line reference. 2 keys have only definition/single-reference evidence: components.PermissionEdit.blocklistedItems, components.PermissionEdit.blocklistedItemsDescription. Those limits are retained in `caller-contexts.jsonl` and should be considered during independent review.

Current/final placeholder mismatches: 0/0. Current/final markup mismatches: 0/0. Source ICU plural/select entries: 9. Current/final protected-literal mismatch cells: 1/0. Protected-literal mismatches are recorded per cell in the ledger; product names and format acronyms are preserved in candidate targets.

## Packet contents and limits

- `primary-review-ledger.jsonl`: one decision per locale cell, exact current/final values and hashes, caller context, rationale, confidence, and integrity checks.
- `correction-candidates.jsonl`, `candidate-targets.json`, `review-plan.json`, and `primary-candidates.json`: proposed target text, hashes, dispositions, and rationale.
- Hindi, Indonesian, and Vietnamese cells include an independent static subreview; its exact packet and row-level reconciliation are in `independent-subreview/` and `independent-subreview-reconciliation.json`. Three byte-identical no-op proposals were revised to accept-current. Native-speaker review remains outstanding.
- `source-window.json`, `source-current-cells.jsonl`, `caller-contexts.jsonl`, `prior-disposition-boundary.json`, `source-boundaries.json`, `catalog-parity.json`, and `input-manifest.json`: frozen inputs and provenance.
- `final-reattestation.json` and `live-localization-prs.json`: final PR/ref/worktree check and current snapshot of all seven localization PRs.
- `INPUT-SHA256SUMS` and `SHA256SUMS`: input and packet checksums.


Native-speaker approval remains outstanding. This is a primary semantic review, not native-speaker approval. No repository files or workflows were changed; no test/build/CI tasks or browser activity were run.
