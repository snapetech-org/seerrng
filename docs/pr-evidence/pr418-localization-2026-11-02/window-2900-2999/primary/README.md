# SeerrNG PR #418 primary localization review — W2900–W2999

## Frozen scope

- Exact PR head: `58697945e3d3fb44c37d49db0cc0f88e3af110cc` / tree `e3076937fe10b4dd3821ea573e8e5e21601fce7d`.
- English source positions: 2900–2999, 100 source IDs × 12 direct locales = 1,200 cells.
- All 12 locale catalogs retain 9494 keys and identical key sets.
- Prior exact dispositions reused: 0; 1,212 prior rows were examined against the live source/targets.

## Review result

- Primary dispositions: `{"accept-current": 929, "propose-correction": 191, "refinement": 80}`.
- Confidence across 1,200 cells: 192 high, 1008 moderate; overall moderate because qualified native-speaker signoff remains outstanding.
- Candidate corrections/refinements: 273. Candidate targets preserve source placeholder semantics, protected product/service literals, and required rich-text tags.
- Independent review covered all 1,200 cells: 927 accepted the current target, 235 concurred with the primary candidate, 32 additional proposals were adopted, and 6 candidates were updated. Unresolved holds: 0.
- ICU cells checked: 60; invalid roots or missing locale-required plural categories: 0.
- Top-level placeholder profiles are exact. Four nested Arabic ICU branch-profile differences are accounted for: the dual form `يومين` expresses two days without a numeric placeholder, while the locale `zero` category is shadowed by the preserved exact `=0` branch. Eight raw markup-count differences occur only in `allowedRequests` and `allowedRequestsUser`, where numeric branches repeat the strong wrapper around `{days}`. All semantic gaps: 0. See `placeholder-equivalence-review.json` and `markup-equivalence-review.json`.
- All 100 source IDs have exact caller-context pins (351 line references across 6 files). True unmapped sources: 0.
- Spanish direct address uses formal or neutral forms; no informal `tú` remains in the audited direct-address cells.
- Qualified native-speaker signoff remains outstanding; none is claimed.

## Evidence

- `source-window.json`, `source-current-cells.jsonl`, `caller-contexts.jsonl`, `caller-gap-extraction-triage.json`, `prior-disposition-boundary.json`, `source-boundaries.json`, and `window-boundary-all-12-readbacks.jsonl` record exact source, current value, caller, and history pins. All 12 W2899 previous-window final targets still match; all 12 W3000 forward-boundary sources were read back.
- `primary-review-ledger.jsonl` records all 1,200 dispositions with current/final hashes, rationale, caller refs, independent-review outcome, placeholder/markup/ICU checks, and confidence.
- `subreview-2900-2949.jsonl`, `subreview-2950-2999.jsonl`, `independent-review-reconciliation.jsonl`, and `crossreview-summary.json` record full independent coverage and reconciliation.
- `manual-proposals.jsonl`, `candidate-proposals.jsonl`, `candidate-targets.json`, `exact-apply-list.jsonl`, `exact-apply-list-summary.json`, and `spanish-formality-review.jsonl` contain proposals and the hash-pinned apply list.
- `summary.json`, `structural-validation.json`, `placeholder-review.json`, `markup-equivalence-review.json`, `icu-review.json`, `language-sources.json`, and `prior-history-through-W2899.json` capture review findings.
- `exact-head-reattestation.json` and `live-pr-snapshots-end.json` record final source/caller/PR reattestation and all-seven-PR state. The tracked worktree remained unchanged; the one existing `.next-webpack-dev` symlink into the prior task's browser scratch was preserved.

This is machine-assisted primary review, not native-speaker approval. No repository files or PR metadata were changed. No tests, builds, CI, scans, or browser sessions were run.
