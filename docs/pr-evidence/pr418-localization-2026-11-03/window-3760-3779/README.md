# SeerrNG PR #418 localization window W3760–W3779

This packet covers 20 English source messages × 12 canonical locales (240 cells) at pinned baseline head `d317a07ea0e5456b6d4660470c57d1f205cd0587` / tree `c1383dfb6e6fd4e926f9c89d4ec6b7e8ea7d6008`. The primary, independent blind, and cross-audit ledgers agree on 228 accept-current, 9 corrections, 3 refinements, and 0 holds. Root approved all 12 selected cross-audit targets.

Catalog application commit: `61bc396b1bb4d79a96b5dedcf294fa44d3eeeb75` (7 locale files, 12 values). The application readback verifies all 240 cells, exact selected values, unchanged non-target values, catalog key sets, per-file key order, protected literals, placeholders, markup, numeric tokens, source immutability, and prior hash-only continuity. Existing per-locale key order differences from English remain unchanged.

## Evidence

- `candidate-free-input/`: sealed 240-cell candidate-free inventory and exact caller/catalog pins.
- `primary-review/` and `blind-review/`: sealed translation ledgers.
- `cross-audit/`: portable exact-head cross-audit, copied source evidence, live attestations, verifier, and checksum list.
- `application/`: selected preimages, 240-cell readback, catalog invariants, commit record, hash-only continuity evidence, and verifier.

Run `python3 docs/pr-evidence/pr418-localization-2026-11-03/window-3760-3779/verify_window_bundle.py` from the repository root to check the whole packet and committed evidence blobs.

Visual acceptance is unverified: the pinned baseline and catalog commit have zero deployments and the persistent Agentic VM reaches only the Seerr setup screen; no setup state was changed. Headed-browser review and qualified native-speaker approval remain pending. No tests, builds, scans, CI dispatches, workflow edits, merge, release, or tag were performed for this window. PR #418 remains open and draft.
