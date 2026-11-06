# W3820-W3839 catalog application evidence

This directory records the 19 proposals selected by the independent cross-audit and their exact application to the PR branch.

- cross-selection.jsonl records the selected locale, source key, old/new values and hashes, rationale, caller-context hash, and source hash.
- apply-plan.jsonl retains each old-value/hash and pinned catalog-file guard.
- application-readback.jsonl records all 240 cells read from catalog commit 3786de8f8334c6f69924e2f88e363f129d3b3943.
- application-manifest.json records the base and catalog commit/tree pins, counts, limitations, and validation status.
- verify-application.py verifies the cross-audit bundle, checksums, guarded selection, all 240 readbacks, all 13 catalog key sets/orders and unselected values, and the empty workflow diff.

The Arabic W3828 components.Settings.MylarModal.compatibilityNote and Indonesian W3833 components.Settings.MylarModal.enableSearchHelp remain holds and were not changed. This evidence does not claim native-speaker signoff or visual acceptance; no exact-head deployment was available. No tests, builds, checks, or CI were run.
