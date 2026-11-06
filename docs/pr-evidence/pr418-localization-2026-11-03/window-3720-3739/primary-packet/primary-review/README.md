# SeerrNG PR #418 primary review — W3720-W3739

Pinned PR head: 1ca6ec2d5a0e9ef8000c69997e75648a8ccaf06e  
Pinned tree: 6a51f3fb1d1f65c12bfe82bf47834626aa364488

This primary review covers 240 locale cells (20 messages × 12 locales) from the sealed candidate-free input. Every ledger row contains the exact source/current hashes, selected target and hash, disposition, rationale, confidence, direct caller evidence, and recomputed token/protected-literal checks.

## Decisions

- Accept current: 189
- Correction: 35
- Refinement: 16
- Hold: 0
- Selected changes: 51
- Carried callerless holds reattested by hash: 12/12

The Hindi hostname label at position 3724 now preserves the exact IP literal. All selected targets pass placeholder, ICU, markup, numeric, and source-required protected-literal checks.

This is a text-only review. Native-speaker and browser review were not performed. Carried holds are preserved by three-way hash agreement; their text is absent, so this is hash reattestation rather than a fresh linguistic decision.
