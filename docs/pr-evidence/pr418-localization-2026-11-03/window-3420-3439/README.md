# SeerrNG PR #418 localization application — W3420–W3439

Applied the six `correction`/`refinement` targets from the reconciled cross-audit ledger to PR head `3f5ddfdddbeb77cf02cc9d14e00001c8d1aa61c6` (tree `1c48dc5ea6e8db6c2da546ec58e88d38eb8f9cc7`). The ledger SHA-256 is `73ad4a4cb9d00831b62eceff9335444a5c52cb30af2f8fc580787e85c90a39c8`.

The window covers 240 cells (20 source IDs × 12 locales). Six target values changed across six locale catalogs. The other 234 cells remain at their current values, including all 24 caller-absent holds for `components.Requests.selectUser` and `components.Requests.service`. `apply-readback.jsonl` records all 240 final values against the ledger; `catalog-readback.json` records catalog hashes, key-set parity, and preservation of each catalog’s pre-apply key order.

| Position | Locale | Source key | Current value | Applied value | Disposition |
| --- | --- | --- | --- | --- | --- |
| 3429 | zh_Hant | `sortAscending` | 升冪 | 升序 | refinement |
| 3431 | id | `sortBy` | Urut menurut | Urutkan berdasarkan | refinement |
| 3434 | zh_Hans | `sortFirstPublished` | 首次发表 | 首次出版 | refinement |
| 3434 | ja | `sortFirstPublished` | 初公開 | 初版発行日 | correction |
| 3434 | pt_BR | `sortFirstPublished` | Primeiro Publicado | Primeira publicação | correction |
| 3434 | ko | `sortFirstPublished` | 첫 게시 | 최초 발행 | correction |

Portable evidence is included in `candidate-free-input/`, `primary-review/`, `blind-review/`, and `cross-audit/`. Their original checksum manifests are retained. `EVIDENCE-SHA256SUMS.txt` covers every file in this directory except itself.

This is machine-reviewed evidence; it does not claim qualified native-speaker approval. No tests, builds, scans, or CI jobs were run. `git diff --check HEAD` is the only code check run for this application.
