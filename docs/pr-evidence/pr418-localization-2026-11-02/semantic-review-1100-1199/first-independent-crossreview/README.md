# SeerrNG PR #418 independent cross-review — W1100–1199

## Pin and scope

- Live PR #418 is open and draft at head `c8f4b2f5f1f42730dcfa8d36214ee827a5d9395a`, tree `0fe67d04abfd49681556b44e900aceec1b5a9a75`, based on `221d8e0d542802da7529cd272c928cc747677e5c`.
- The read-only worktree matches the exact head/tree and is clean.
- Scope: 100 English source keys at insertion positions 1100–1199, 1,200 cells across 12 direct locales.

## Independent candidate dispositions

| Disposition | Candidate count |
| --- | ---: |
| Accepted as proposed | 198 |
| Refined | 20 |
| Held | 0 |
| No-op | 0 |

The primary packet contains 206 correction candidates and 12 refinement candidates. All 218 candidate hashes were recomputed from the exact proposed target strings and matched the candidate hash index. The 20 cross-review refinements adjust exact targets after checking the source and caller context. The 12 primary refinement candidates came from the reviewer's disclosed prior exposure and were accepted as written after rechecking.

The full row ledger also records 7 missed corrections among primary accept-current cells, 969 accepted-current cells, and 6 preserved prior Spanish root dispositions. This accounts for all 1,200 rows. Missed corrections are listed separately in `missed-corrections.jsonl` with exact target suggestions and hashes.

## Re-attestation and prior overlap

- Re-attested all 100 source rows and 1,200 current cells at the live head. No source/current/hash mismatches were found.
- Re-attested 231 caller references across 10 files and 229 unique caller lines. Every file blob, whole-file SHA-256, exact line text and line hash matched.
- Verified all 12 locale catalog blobs and hashes. Candidate source/current/proposal hashes and ICU/markup parity passed.
- The W1000–1099 packet source-ID range is disjoint from this range.
- Scanned 369 JSON/JSONL files under the PR evidence tree. Six distinct prior Spanish root dispositions intersect by source ID; all six are preserved and each current target matches its prior applied value. The rows are referenced in the candidate ledger, exact-hash apply plan, root cross-review, and source-context evidence.

## Prior review exposure and limits

The reviewer previously examined positions 1151–1199 for German, Spanish, French and Brazilian Portuguese. That segment is not blind. Those findings are disclosed in the summary and row ledger, then rechecked against the exact current source, caller pins and hashes.

This cross-review did not edit repository or PR files and did not run tests, builds, security scans or CI. A read-only evidence inventory scan was used only to check prior disposition overlaps. Qualified native-speaker and browser review remain separate. Confidence is moderate for the machine-assisted semantic judgments.

## Files

- `cross-review-ledger.jsonl` — row-level disposition for every cell, including source/current/final hashes and caller pins.
- `missed-corrections.jsonl` — the seven corrections absent from the primary proposal list.
- `candidate-hash-index.jsonl` — recomputed exact hashes for all primary candidates.
- `reattestation.json` — live head, catalog, source/current, candidate and caller verification.
- `prior-disposition-boundary.json` — previous-window and prior-root overlap findings.
- `summary.json` — counts, scope and review limits.
- `build_crossreview.py`, `reattest.py` — reproducible packet construction and pin verification scripts.
- `SHA256SUMS` — packet integrity manifest.
