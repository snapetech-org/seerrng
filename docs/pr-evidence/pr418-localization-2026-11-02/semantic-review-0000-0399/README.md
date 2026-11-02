# SeerrNG semantic review and corrections, source positions 0–399

This package records 1,080 exact-hash correction candidates across the 12 direct locales for PR #418. Cross-review resolved 1,078 as catalog edits and accepted two candidates unchanged because their final strings exactly matched the current targets. The review and application were pinned to head `d1137d06ffb5af57ef599ac9bf495aff2a990a7b`, tree `0aa22f0bb43e3e30d216e2ae19939220e05f04f7`, and English source tree `db8d479688d06980e63c5f71362d64f16efa50d8`. Every applied cell matched its reviewed source, current target, and cross-reviewed final target by SHA-256 before the edit; after the edit, all 1,078 changed target hashes and locale catalog key parity were read back successfully; two accepted candidates required no edit.

## Results

| Source positions | Candidates cross-reviewed | Accepted as proposed | Refined by cross-review | Accepted unchanged | Catalog edits | Prior dispositions carried forward |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0000-0099 | 373 | 363 | 10 | 0 | 373 | 30 |
| 0100-0199 | 218 | 215 | 3 | 0 | 218 | 21 |
| 0200-0299 | 291 | 273 | 18 | 2 | 289 | 8 |
| 0300-0399 | 198 | 182 | 16 | 0 | 198 | 28 |

Review confidence is moderate. Machine review does not establish native-speaker approval. No source code or workflow files changed in this milestone.

## Visual review boundary

No rendered comparison was completed for this correction batch. The isolated Agent Desktop Pool browser could not reach the private/LAN app origin; the local service/browser combination was not rerouted and no desktop session was interrupted. Visual acceptance remains unverified.

## Files

Each range directory contains its primary semantic ledger, independent cross-review ledger, and the available summaries. `prior-dispositions-preserved.jsonl` retains the 87 prior routed cells without re-adjudicating them. `accepted-current-noops.jsonl` records two cross-reviewed candidates that already matched their approved final strings. `exact-hash-apply-plan.jsonl` records old and final strings with source/current/final hashes and review dispositions. `apply-report.json` records the exact cell and catalog readback results. This evidence does not authorize or claim a release.
