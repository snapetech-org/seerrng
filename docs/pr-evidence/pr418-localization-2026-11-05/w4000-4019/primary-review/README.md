# SeerrNG PR #418 W4000-W4019 primary review

This primary-only semantic review covers 20 source IDs × 12 locales (240 cells), pinned to `ac193096ebfc0007183348b24e35bf6fee33f67a` / `93e71e7c52602ec3f8b76548fd12b2f5b4368b4c`. The candidate-free input copy is `../candidate-free-input`; its manifest SHA-256 is `619ceb7419f7d3fabde471580a714e5010dbc90e5f41b1ebeee04cfb80597a38` and its checksum-manifest SHA-256 is `c0c925b92b7921c37c8ec85980420f0584fdf381d8c6a60f642124bea7c62246`.

Primary decisions: 194 accept current, 27 corrections, 7 refinements, and 12 hash-only holds. The holds are all position 4013 (`Enable Agent`); three notification providers use the label without defining its product meaning.

The Japanese `1つ以上` at position 4007 expresses “one or more”; its numeral is a meaning-preserving equivalent of the English word, so it is accepted with an explicit assessment despite the mechanical numeric-token diagnostic. Candidate-free diagnostics also record that mismatch.

Proposed targets are checked for placeholders, markup, numeric tokens, and protected literals. This is a machine-assisted primary review; it does not claim native-speaker approval or browser acceptance. No catalog/PR changes, tests, builds, scans, or CI were performed. No blind output was inspected and no cross-review or root adjudication was performed.

Verify with `python3 verify-primary.py --candidate-free ../candidate-free-input`. Checksums are in `SHA256SUMS.txt`.
