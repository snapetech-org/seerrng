# SeerrNG Spanish semantic review, window 650–699

This is a scratch-only candidate packet for root cross-review of PR #418. It does not change catalogs or repository files.

## Exact pins and scope

- Live PR: `OPEN/DRAFT`, head `422072d585074bdd7f8dd3046cbacede69203d6d`, tree `c7f3bffb628464e98188f3c8f8c4950d6038cee6`.
- Application source: commit `affd7a87860e3613d5c6842c20eb0b45f3bd062f`, tree `2471ca52d8b94504879e5842e8ffae920a22e180`.
- Frozen semantic manifest: `3ea74cc6491aecddf9ffcedc69610f13d20b199059aef69bb3c2407feb0826ea`.
- Frozen cell plan: `97c3402252a34aaa4f8f9f44a691281d9c35ff7b80d7edb3a26c752436af6558`.
- Frozen source bundle: `212491482d1b9207fed755af6e80ac80a97184ec8dbe84d0c4ad2bd711acae0d`.
- Window: 50 Spanish client batches `existing-es-client-0054` through `existing-es-client-0103`, 1,600 cells.

`selected-cell-attestation.jsonl` records each selected source ID/text/hash and current Spanish target/hash at the exact live head. All 1,600 source rows and all 1,600 current-target rows match; both mismatch lists are empty. `source-contexts.jsonl` provides 289 exact-literal caller contexts across 186 source files and 949 caller lines. Every caller file blob matches between the pinned application-source tree and the exact live PR head; no context IDs or caller paths are missing or changed. The line hashes and blob IDs are in `exact-head-attestation.json`.

## Review outcome

- 1,311 machine-reviewed current values kept.
- 283 correction candidates prepared for independent root cross-review.
- Six uncertain cells held.
- 49 batches passed the strict semantic runner. Batch `existing-es-client-0094` exhausted four attempts because the protected-literal checker treated inline `<ProfileLink>` tags adjacent to text as missing.
- The 32 rows from `0094` were manually checked against the exact request and live cells. All IDs and decision fields match; ICU signatures, non-tag protected literals, and ordered HTML tag multiplicity match. Those decisions are explicitly labeled `manual-exception-ledger`, and the batch exception is recorded in `manual-exception-0094.json`.

The manual exception includes the candidate for `components.RequestModal.QuotaDisplay.quotaLinkUser`: the source is singular (“this user's … their profile page”), while the current Spanish uses plural “estos usuarios” and “páginas”. The proposed singular wording preserves `<ProfileLink>` and `</ProfileLink>` in source order. Keep this as a candidate for root cross-review; no catalog edit was made.

## Files

- `candidate-ledger.jsonl`: 283 source/current/proposed values with exact hashes, caller-linked IDs, and batch pins.
- `accepted-current-machine-decisions.jsonl`: 1,311 unchanged values.
- `held-uncertain-cells.jsonl`: six uncertain values with reasons.
- `batch-ledger.jsonl`: all 50 batch hashes, output response hashes, attempt numbers, and validation status.
- `source-contexts.jsonl`, `selected-cell-attestation.jsonl`, `exact-head-attestation.json`: exact-head source, caller, and current-target evidence.
- `manual-exception-0094.json`: all four request/response/error hashes and the narrowly scoped inline-tag validation exception.
- `semantic-output/`: retained model requests, raw responses, strict results, error records, and run summary.
- `runner-window-650-700.py`, `build_window_packet.py`, `preflight.json`: reproducible review input and packet-generation provenance.

No tests, builds, scans, CI jobs, releases, or tags were run or created. Native-speaker approval is not claimed. Root cross-review is pending; do not apply candidates before that review.
