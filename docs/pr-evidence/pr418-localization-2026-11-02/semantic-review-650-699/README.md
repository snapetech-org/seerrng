# SeerrNG Spanish semantic review, window 650–699

This evidence package records the exact-head review and application for PR #418. The reviewed PR base was `422072d585074bdd7f8dd3046cbacede69203d6d` / tree `c7f3bffb628464e98188f3c8f8c4950d6038cee6`; application source remains commit `affd7a87860e3613d5c6842c20eb0b45f3bd062f` / tree `2471ca52d8b94504879e5842e8ffae920a22e180`.

## Review and application

- The 50-batch window contains 1,600 Spanish client cells: 1,311 machine-kept values, 283 correction candidates, and six held-uncertain cells. The strict runner validated 49 batches; batch `existing-es-client-0094` was manually reconciled after its protected inline-tag boundary checker exhausted four attempts. The packet records zero unresolved batches after that manual validation.
- The final root review accepted 236 candidate proposals and refined 47 candidate targets. Of the six held cells, four were kept unchanged and two were refined. Exactly 285 Spanish target values were applied; the other four held values and 1,311 machine-kept values remain unchanged.
- Independent final target strings and hashes match the final root target for all 289 cross-reviewed rows. Ten independent refinements of earlier root targets were adopted by the final root review. Both ledgers preserve historical false agreement flags on those ten rows; their final target values and hashes agree.
- The only changed catalog is `src/i18n/locale/es.json`. Its SHA-256 changed from `19ab22d6398a536710a09a568043f9233f27cb7d09770cb6666430b674848c59` to `eadf9f4bf7f1b40dda15dcad373c0bb62be8f6cb13436571523ba26c2cfd7ed6`; the resulting Git blob is `887e33b2303d894c4335b1b246b6ab6c05448409`.
- Focused application validation confirmed all 285 exact source/current/final target hashes, exact changed-ID coverage, English/Spanish key parity (9,494 IDs), duplicate-free JSON, independent final-target agreement, the allowlisted changed path, and `git diff --check`. This work did not run tests, builds, scans, CI dispatches, releases, or tags; no workflow files changed.
- Native-speaker approval is not claimed. This semantic catalog milestone does not complete broader browser, semantic-catalog, private-JIT, or native-speaker acceptance.

## Evidence files

- `frozen-packet/` preserves the complete frozen candidate packet, including exact-head attestations, caller contexts, all 50 batch records, candidate and held ledgers, semantic runner inputs/outputs, and its original `SHA256SUMS.txt`. `frozen-packet-checksum-verification.txt` records the manifest verification.
- `root-crossreview/` preserves the final root ledger, final summary, README, checksums, and source working/supplement ledgers.
- `independent-crossreview/` preserves the independent ledger, summary, review generator, README, and checksums.
- Final root ledger SHA-256: `ea1d5c7d5973a5b29e243dd94278cd32a021f15c3f26eb7e5f3d443504ad131f`. Independent cross-review ledger SHA-256: `27ed3f20354510d3e59f19f7e34470482bec9e554a32be5ec5f5590e6415ac5c`.
- `preapply-attestation.json`, `exact-hash-apply-plan.jsonl`, `focused-validation.json`, and `apply-report.json` document the pinned inputs, reviewed targets, writes, and post-application checks.
- The user-facing release-note fragment is `release-notes/20261102-spanish-localization-review-650-699.md`; it is prepared for the next release and does not cut one.
- `updated-pr-body.md` is the exact PR description published with this evidence commit.
- `SHA256SUMS` covers this evidence package except itself.
