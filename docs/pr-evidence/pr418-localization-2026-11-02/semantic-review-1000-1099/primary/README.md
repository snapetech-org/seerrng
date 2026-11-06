# SeerrNG PR 418 primary semantic review: source positions 1000–1099

This task-scratch packet covers 100 source IDs at 0-based JSON insertion positions 1000 through 1099 and all 12 direct target locales (1,200 current catalog cells).

## Exact pins

- Live PR: OPEN, draft, CLEAN
- Branch: codex/seerrng-localization-overhaul-20261028
- Head: 447b806871926a7c8dea06958d19cbd7e5230006
- Tree: 92450b5d67ea7551ef1eb262c05f77053ea016a0
- Base: 221d8e0d542802da7529cd272c928cc747677e5c
- Source catalog blob: 12e04a118c30b71b3714291adeaf9fdb2735cee4
- Source catalog SHA-256: 75ff3c90b52aedd636a506281ffbd6fb2d3739c61294b6008a517f17647e2316
- Boundaries: components.Discover.FilterPanel.genres at 1000 through components.Discover.TvGenreSlider.tvgenres at 1099

The exact-head worktree was read from Git objects. The adjacent W900–999 packet is pinned to positions 900–999, so this window is non-overlapping.

## Review totals

One source key, components.Discover.ReadMeABookSearch.disabled at position 1080, has an exact definition reference but no use reference in the pinned component; it is recorded as definition-only.

- 100 source IDs and 1,200 source/current locale cells
- 1,188 new machine semantic reviews; 12 prior Spanish root dispositions preserved
- 228 correction candidates; 960 accept-current cells; 12 frozen prior dispositions
- 230 caller-context references re-attested across 16 caller files; zero mismatches
- Zero placeholder, markup, and protected-literal parity failures
- Native-speaker review was not performed and remains required. Browser review was not performed.

Per-locale counts are in summary.json. The JSONL evidence includes every source/current cell, exact hashes, caller contexts, and each exact proposal with a rationale.

## Preserved Spanish routing

Tracked PR evidence in semantic-review-600-649/root-cross-review.jsonl contains 12 prior Spanish dispositions in this source-position range. Each exact current value at this head matches its prior final target. The cells are recorded in preserved-prior-routing-rows.jsonl and are not rerouted. New Spanish corrections use formal usted or impersonal phrasing; the 12 previous values keep their reviewed wording and register.

## Files

- manifest.json: repository, PR, exact head/tree, locale hashes, and range
- summary.json: counts, parity results, review limits, and state pins
- source-current-attestation.jsonl: 100 source rows plus 1,200 current target hashes
- selected-direct-locale-cells.jsonl: all 1,200 source/current values and catalog pins
- source-contexts.jsonl: exact message definitions and caller contexts
- caller-context-attestation.jsonl: line/file hashes re-attested at the pinned head
- primary-review-ledger.jsonl: one decision and candidate/rationale per locale cell
- preserved-prior-routing-rows.jsonl: the 12 preserved Spanish root decisions
- build_packet.py: task-scoped packet generator

No repository or PR changes were made. No builds, tests, scans, CI, workflow edits, or releases were run.
