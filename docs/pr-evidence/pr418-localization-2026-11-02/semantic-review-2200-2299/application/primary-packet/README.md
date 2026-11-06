# SeerrNG PR #418 primary semantic review: W2200–2299

This packet reviews 100 English catalog entries across the 12 direct locales (ar, de, es, fr, hi, id, ja, ko, pt_BR, vi, zh_Hans, zh_Hant): 1,200 locale cells.

## Exact input pin

PR #418 was OPEN/DRAFT at head 8c27beb8086ea6f840bdcde4b915d83db27f81a3, tree 2951195dd04af87add189090756e0d0f43e8e031. The GitHub API, remote branch, and detached worktree were rechecked before and after review; the worktree was clean. Source positions are zero-based insertion order in `src/i18n/locale/en.json`. The frozen cell ledger includes source and current-target hashes, catalog pins, and caller-context hashes.

The review proposes 252 corrections and 10 refinements, accepts 938 current values, and has 0 holds. Exact prior rows with source and final target matching the live catalog: 285. The reconciled four-locale audit supplied 284 accept-current rows plus one no-op proposal whose target equaled current; 18 of those accepted-current rows were explicitly overridden here with correction/refinement proposals, and 267 exact-current decisions remain accepted. Other historical matches without a current final-target match were not reused.

## Caller evidence and integrity

Pinned caller evidence has 345 line references across 9 source files for all 100 source IDs. No source lacks a pinned line reference. 5 keys have only definition/single-reference evidence: components.MovieSummaryCard.minutes, components.MusicDetails.Layout.lidarrRating, components.MusicDetails.Layout.minutes, components.MusicDetails.Layout.musicBrainzRating, components.MusicDetails.Layout.status. Those limits are retained in `caller-contexts.jsonl` and should be considered during independent review.

Current/final placeholder mismatches: 0/0. Current/final markup mismatches: 0/0. Source ICU plural/select entries: 0. Current/final protected-literal mismatch cells: 5/0. Protected-literal mismatches are recorded per cell in the ledger; product names and format acronyms are preserved in candidate targets.

## Packet contents and limits

- `primary-review-ledger.jsonl`: one decision per locale cell, exact current/final values and hashes, caller context, rationale, confidence, and integrity checks.
- `correction-candidates.jsonl`, `candidate-targets.json`, `review-plan.json`, and `primary-candidates.json`: proposed target text, hashes, dispositions, and rationale.
- `independent-language-audit-reconciliation.json`: comparison with the separate Arabic/Hindi/Indonesian/Vietnamese audit, including disagreements and prior-current overrides.
- `source-window.json`, `source-current-cells.jsonl`, `caller-contexts.jsonl`, `prior-disposition-boundary.json`, and `input-manifest.json`: frozen inputs and provenance.
- `final-reattestation.json`: final PR/ref/worktree check.
- `INPUT-SHA256SUMS` and `SHA256SUMS`: input and packet checksums.

The separate four-locale audit at /mnt/disks/scratch/task-scratch/seerrng-pr418-window-2200-2299-language-audit-agent-20261102 was checksum-validated (its SHA256SUMS SHA-256 is 949a0fa452957221d9f236a1d01caf41f726ad70a7b3fd9312d35a75c891c009) and reconciled in independent-language-audit-reconciliation.json. The reconciliation records the exact accepted-current overrides and two candidate wording differences.

Native-speaker approval remains outstanding. This is a primary semantic review, not native-speaker approval. No repository files or workflows were changed; no test/build/CI tasks or browser activity were run.
