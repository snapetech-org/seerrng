# SeerrNG PR #418 primary semantic packet — source positions 1100–1199

## Pin and scope

- Live PR: `snapetech-org/seerrng#418`, open draft.
- Exact head: `c8f4b2f5f1f42730dcfa8d36214ee827a5d9395a`.
- Tree: `0fe67d04abfd49681556b44e900aceec1b5a9a75`.
- Base: `221d8e0d542802da7529cd272c928cc747677e5c`.
- Source catalog: `src/i18n/locale/en.json`, blob `12e04a118c30b71b3714291adeaf9fdb2735cee4`.
- Source insertion positions: 1100–1199 inclusive, 100 IDs × 12 direct locales = 1,200 cells.
- This window is non-overlapping with the prior W1000–1099 packet. The packet pins all 1,200 source/current cells and re-attests source definitions, caller references, catalog hashes, and exact current-head lines.

## Semantic dispositions

| Disposition | Count |
| --- | ---: |
| Accept current | 976 |
| Proposed correction | 206 |
| Proposed refinement | 12 |
| Preserved prior root disposition | 6 |

The six frozen rows are Spanish root refinements for ListenBrainz Music Chart; the DownloadBlock fail-and-search labels; and Stalled. Each current Spanish target matches the earlier exact-hash applied value. A scan of current PR evidence found no other disposition intersecting this source window. The primary proposals do not edit those rows.

The 218 proposal targets are candidates for independent review, not catalog edits. Every candidate includes the exact current target hash, proposed target hash, source hash, pinned head/tree and concise rationale. `candidate-hashes.jsonl` provides a compact lookup of current and proposed target hashes.

## Re-attestation

- 1,200 current translation cells plus 100 English source rows were hash-attested.
- 231 caller references in 10 files, spanning 229 unique caller lines, were re-read at the exact head; the per-line records include blob and line hashes.
- All twelve target catalogs contained exactly the same 9,494 keys as the English source catalog.
- Source/current/proposal placeholder names and markup tags were checked. No candidate parity failures remain.
- Seven current product-name mismatches involving protected names were routed to proposals; all proposed targets preserve the source product name.

## Limits and outputs

This is machine-assisted primary review. It has not received complete independent candidate cross-review, qualified native-speaker review, or browser review. The independent reviewer consulted for positions 1151–1199 in German, Spanish, French and Brazilian Portuguese; their high-confidence and moderate-confidence findings are integrated in the candidate ledger. No repo or PR files were edited. No tests, builds, scans or CI jobs were run.

Files:

- `manifest.json` — live PR, tree, catalog and boundary pins.
- `summary.json` — counts, coverage and review limitations.
- `source-current-attestation.jsonl` — English source and current target hash records.
- `selected-direct-locale-cells.jsonl` — exact source/current translation rows.
- `source-contexts.jsonl` — source IDs, definitions, uses and source hashes.
- `caller-context-attestation.jsonl` — per-line caller blob and hash pins.
- `primary-review-ledger.jsonl` — complete cell-level decisions, parity, candidate and prior disposition records.
- `candidate-proposals.jsonl` — exact proposed strings, rationales and hash pins.
- `candidate-hashes.jsonl` — candidate current/proposed hash index.
- `preserved-prior-routing-rows.jsonl` — six preserved Spanish root refinements and their prior/apply evidence.
- `build_packet.py` — reproducible exact-head attestation builder.
- `SHA256SUMS` — integrity hashes for the packet files.
