# SeerrNG populated-catalog semantic review, batches 600–649

This package records the Spanish client catalog application for PR #418. The exact source/current-target snapshot was pinned to PR head `2c5b7a5dcbe01707ac361e2d4ae06bf3681f99e2` / tree `9fc918e9247d7ceaec5f0744c13ada81f7e4ba21`; application code remains at source tree `2471ca52d8b94504879e5842e8ffae920a22e180`.

## Review and application

- The 50-batch window covered 1,600 cells: 1,371 machine-kept values, 224 correction candidates, and five uncertain cells held for later review.
- An independent root review dispositioned all 224 candidates: 152 accepted as proposed, 70 refined, and two kept at the current value. This resulted in 222 Spanish catalog value changes and two unchanged values.
- All 222 writes were guarded by exact English-source and Spanish-current-target hashes. Five held values were rechecked and left unchanged.
- The changed file is `src/i18n/locale/es.json`; English and Spanish catalog key parity remains exact.
- Focused checks passed for JSON validity and duplicate keys, placeholders/ICU argument names and selector structure, HTML tags, numeric literals, source acronyms/brands, and the exact changed-key set. `git diff --check` passed. No tests, builds, CI, releases, or workflow edits were made.
- Native-speaker approval remains outstanding; this package does not claim native signoff.

## Evidence

`root-cross-review.jsonl` is the independent 224-cell review. `candidate-ledger.jsonl` and `source-contexts.jsonl` preserve the exact proposal and caller context; `held-uncertain-cells.jsonl` preserves the five unchanged holds. `exact-hash-apply-plan.jsonl`, `preapply-attestation.json`, `focused-validation.json`, and `apply-report.json` record the source/current hash checks, target values, file hashes, counts, and post-apply invariants. `review-packet-attestation.json` pins the packet to the reviewed PR head and catalogs. `SHA256SUMS` covers every evidence file except itself.
