# SeerrNG PR #418 W3820-W3839 cross-audit

This bundle independently reconciles all 240 current source/locale cells from the candidate-free input, the primary semantic review, and the blind review.

## Verify

Run:

    python3 verify-cross-audit.py

The verifier is offline and uses only this directory. It checks the candidate-free and blind verifiers, all packet and bundle checksums, the 9,494 English source rows, all 13 pinned catalogs, all four pinned runtime files, each caller excerpt, every target-to-catalog binding, both review ledgers, and each cross-audit disposition.

The primary review's included verifier contains its original absolute kspls0 input path. It passed on kspls0 during this audit; this bundle's verifier independently checks its checksum, input manifest hashes, all 240 primary rows, caller bindings, proposals, and token-integrity results without relying on that path.

## Files

- cross-audit-ledger.jsonl: one row for every position/locale cell, with source, target, catalog, caller, primary, blind, and cross-audit evidence.
- summary.md and summary.json: scope, dispositions, holds, and limits.
- evidence/candidate-free-input, evidence/primary-review, evidence/blind-review: exact input packets and review outputs.
- evidence/pinned-tree: the 13 locale catalogs and four runtime files from the pinned head.
- evidence/git-object-proof.json: commit and Git tree objects that bind the exported files to the exact pinned commit offline.
- evidence/source-provenance.json: observed remote ref and fetch details.

Cross-audit results retain two cells for focused review: Arabic W3828 pending a qualified terminology check, and Indonesian W3833 pending confirmation of the pronoun's referent. Native-speaker signoff is not claimed.
