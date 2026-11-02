# SeerrNG PR #418 primary localization review — W2800–W2899

## Frozen scope

- Exact PR head: `7329f0ffb34d46042dbf1b165046e21c4f4d45e3` / tree `531e045f511ee9c46f4c7ed80d50f529c9c12000`.
- English source positions: 2800–2899, 100 source IDs × 12 direct locales = 1,200 cells.
- Catalogs retain 9494 keys each, with matching key sets.
- Prior exact dispositions reused: 0; all selected cells were reviewed at the frozen head.

## Review result

- Primary dispositions: `{"accept-current": 835, "propose-correction": 250, "refinement": 115}`.
- Confidence across 1,200 cells: 184 high, 1016 moderate; overall moderate because qualified native-speaker signoff remains outstanding.
- Candidate corrections/refinements: 365. All proposal targets preserve exact placeholder syntax, markup, and protected product/service literals.
- ICU formatter profiles checked: 36; invalid profiles: 0.
- There are 13 raw placeholder-profile differences in unchanged accepted targets. Each redundantly supplied simple `{count}`/`{total}` value is still rendered by the same ICU plural argument with locale-aware `#` (Arabic one/two branches use inflected number words). All 13 are accounted for; unresolved semantic gaps: 0. See `placeholder-equivalence-review.json`.
- All 11 initial caller gaps were extractor alias misses for `components.RequestModal.CollectionFilters.*`; they now resolve to `src/components/RequestModal/VideoCollectionRequestFilters.tsx` with exact line/blob hashes. True unmapped source count: 0.
- `components.RequestModal.Book.requestfrom` (position 2812) was cross-checked across all 12 locales. The English source is valid; Indonesian, Japanese, Hindi, and Vietnamese candidates correct missing/misassigned content. See `requestfrom-2812-all-locales-review.json`.
- Spanish direct-address rows use formal or neutral forms; no informal `tú` target remains in the audited direct-address cells.
- Qualified native-speaker signoff remains outstanding; none is claimed.

## Evidence

- `source-window.json`, `source-current-cells.jsonl`, `caller-contexts.jsonl`, `caller-gap-extraction-triage.json`, `prior-disposition-boundary.json`, and `source-boundaries.json` record exact input and caller provenance.
- `primary-review-ledger.jsonl` contains all cell decisions with current/final hashes, rationale, placeholders, markup, caller pins, confidence, and prior disposition state.
- `candidate-proposals.jsonl`, `candidate-targets.json`, and `spanish-formality-review.jsonl` contain final proposals and language/register review.
- `summary.json`, `structural-validation.json`, `placeholder-equivalence-review.json`, `requestfrom-2812-all-locales-review.json`, `icu-review.json`, `language-sources.json`, and `prior-history-through-W2799.json` record validations and history.
- `exact-head-reattestation.json` records the all-12 catalog, 1,200 source/current-cell, caller-context, caller-file, and pinned-line hash checks. `live-pr-snapshots-end.json` records all seven PRs at the end; ROMarrNG #70 advanced independently during this review.

This is machine-assisted primary review, not native-speaker approval. No repository files or PR metadata were changed, and no tests, builds, scans, CI, or browser sessions were run for this subtask.
