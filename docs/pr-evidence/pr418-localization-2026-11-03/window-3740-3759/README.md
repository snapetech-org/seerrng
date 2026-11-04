# SeerrNG PR #418 localization window W3740–W3759

This evidence window covers 20 source strings across 12 direct locales (240 cells). At baseline head `8d0273ebc5eb51e9d5fee0ac9a0eb022eeed06c4`, independent primary and blind review plus cell-level cross-audit selected 54 updates: 29 corrections and 25 refinements. The other 186 cells remain unchanged.

Catalog commit `b703ef4c13fee64d71aab8180531ff15de9a738e` (tree `9626c77fc17fec31bdab8f34a9faf148a6187096`) is a direct child of that pinned baseline. It changes only 11 target locale catalogs; `zh_Hant` had no selected changes. English source data remains unchanged. Exact readback covers all 240 cells, with 12 carried holds and 240 previous selections reattested hash-only.

The cross-audit packet includes all candidate-free inputs, primary and blind ledgers, explicit conflict resolutions, token/literal checks, before/after PR attestations, and portable verifiers. The application packet checks Git parent/tree objects, each target preimage and result, catalog key order, non-target values, and hold/selection hashes.

Qualified native-speaker review remains pending. No exact-head Seerr product-browser review is claimed: GitHub reported zero deployments for the baseline and catalog commit heads. No tests, builds, scans, CI dispatches, workflow edits, merges, releases, or tags were run.

Run `python3 docs/pr-evidence/pr418-localization-2026-11-03/window-3740-3759/verify_window_bundle.py` from the repository root. It verifies the cross-audit packet, application readback, checksums, and committed evidence blobs.
