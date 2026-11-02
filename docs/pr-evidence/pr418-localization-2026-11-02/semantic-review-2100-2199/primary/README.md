# SeerrNG PR #418 primary semantic review: W2100–2199

This packet reviews 100 English catalog entries across the 12 direct locales (ar, de, es, fr, hi, id, ja, ko, pt_BR, vi, zh_Hans, zh_Hant): 1,200 locale cells.

## Exact input pin

PR #418 was OPEN/DRAFT at head 404648643578992e8e12ce9dff47dd92d5ee7c1c, tree a17442223e33372e0cc16c3b8091e2515d5e39f3. The GitHub API, remote branch, and detached worktree were rechecked before and after review; the worktree was clean. Source positions are zero-based insertion order in `src/i18n/locale/en.json`. The frozen cell ledger includes source and current-target hashes, catalog pins, and caller-context hashes.

The review proposes 178 corrections, accepts 1022 current values, and has 0 holds. Exact prior final dispositions reused: 0. Earlier evidence contained 1212 matching historical rows, but none was an exact source plus final-target disposition at this input.

## Caller evidence and integrity

Pinned caller evidence has 310 line references across 12 source files for all 100 source IDs. No source lacks a pinned line reference. Seven keys have only definition/single-reference evidence: components.MovieDetails.Layout.director, components.MovieDetails.Layout.genres, components.MovieDetails.Layout.mediaAndFormat, components.MovieDetails.Layout.minutes, components.MovieDetails.Layout.runtime, components.MovieDetails.Layout.screenplay, components.MovieDetails.Layout.ultraHd. Those limits are retained in `caller-contexts.jsonl` and should be considered during independent review.

Current/final placeholder mismatches: 0/0. Current/final markup mismatches: 0/0. Source ICU plural/select entries: 0. Current/final protected-literal mismatch cells: 10/0. Ten provider-name cells propose preserving `The Movie Database (TMDB)`.

## Packet contents and limits

- `primary-review-ledger.jsonl`: one decision per locale cell, exact current/final values and hashes, caller context, rationale, confidence, and integrity checks.
- `correction-candidates.jsonl`, `candidate-targets.json`, and `review-plan.json`: proposed target text, hashes, and rationale.
- `source-window.json`, `source-current-cells.jsonl`, `caller-contexts.jsonl`, `prior-disposition-boundary.json`, and `input-manifest.json`: frozen inputs and provenance.
- `final-reattestation.json`: final PR/ref/worktree check.
- `INPUT-SHA256SUMS` and `SHA256SUMS`: input and packet checksums.

Native-speaker approval remains outstanding. This is a primary semantic review, not native-speaker approval. No repository files or workflows were changed; no test/build/CI tasks or browser activity were run.
