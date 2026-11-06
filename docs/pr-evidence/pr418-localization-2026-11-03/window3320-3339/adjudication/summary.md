# SeerrNG PR #418 W3320–W3339 independent adjudication

## Scope and pins

- Repository / PR: `snapetech-org/seerrng` / #418
- Head / tree: `70caabc2f95df1a7de3f869111aea1df58522d96` / `daac9e9284adac648fd3f6147265c21c90cdddba`
- Comparison: corrected candidate-free input, sealed independent blind ledger, and candidate-free primary ledger; 240 unique cells compared one-to-one.
- Corrected input: `/mnt/disks/scratch/task-scratch/seerrng-pr418-w3320-3339-20261103-corrected/clean-input`; primary review: `/mnt/disks/scratch/task-scratch/seerrng-pr418-w3320-3339-20261103-corrected/primary-review`; blind ledger: `/mnt/disks/scratch/task-scratch/seerrng-pr418-w3320-3339-independent-blind-20261103`. All three checksum manifests verified before comparison.
- Exact source, current-target, catalog file/Git blob, caller existence/reference counts, and caller-context hashes matched across the three artifacts for all 240 cells. Source/current/primary-target/blind-target hashes were recomputed from exact UTF-8 values.

## Ratification

- Approved value changes in the apply plan: 17
- Retain current target: 163
- Caller-context holds: 60

The 60 holds remain across five source IDs with no exact direct caller in the corrected input: `components.Requests.deleted`, `components.Requests.deleting`, `components.Requests.ebook`, `components.Requests.ebookAndAudiobook`, and `components.Requests.format`. No exact-caller evidence disproved any hold.

### Comparison outcomes

- Exact proposed-target agreement: 8 changes.
- Primary-only changes accepted after caller/context review: 5.
- Both reviews flagged ETA but differed in wording; the primary target was selected: 4.
- One blind-only zh_Hant empty-title suggestion was not adopted; primary accepted `未找到要求`, which remains the ratified target pending locale-native review.
- The remaining 162 eligible unchanged cells were retained by both reviews.

Approved edits by key: `editTooltip` (hi, ja, ko, vi); `emptyTitle` (pt_BR); `eta` (ar, de, es, fr, id, ja, pt_BR, vi); `firstPublished` (ar, id, ja, zh_Hans). Exact proposed strings and all current/proposed hashes are in `apply-plan.csv`. The plan changes localized values only and was not applied.

## Integrity checks

- All source/current/ratified placeholder lists match exactly, including `{name}` and `{date}`; no placeholder-parity exceptions were found.
- Markup-tag parity was recomputed for source/current/ratified strings; all are plain text with no markup tags.
- Protected source literals are preserved. The manifest lists no protected-literal occurrences in this window; this adjudication separately treats `4K` as a protected technical token and confirms it remains exact in all locales. Numeric-token parity holds; `4K` is the only numeric token.
- Arabic/RTL notes are included on every Arabic row. Mixed-direction `{name}`, `{date}`, `4K`, and the `+` separator are explicitly called out for bidi-order checks.
- The 20 source IDs appear once at the same positions across all 12 locales (240/240 window key matrix). All 13 catalogs report 9,494 keys. Full-catalog ordered-key hashes fall into two groups: the English/common sequence hash and a second hash for `zh_Hans`, `ja`, `ko`, `zh_Hant`, and `vi`. Therefore full ordered-sequence parity does not hold. The input contains key counts and hashes, not full catalog key lists, so full key-set equality cannot be independently recomputed from these artifacts; see `catalog-key-order-audit.json`. The apply plan makes no key-order changes.

## Limits and execution status

Native-speaker approval remains pending; this is machine-assisted adjudication, not qualified native-speaker approval. The plan is not applied, and no repo/PR mutation, tests, builds, scans, CI, or headed-browser acceptance were performed.
