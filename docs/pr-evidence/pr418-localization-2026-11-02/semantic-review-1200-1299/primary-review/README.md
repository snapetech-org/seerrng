# SeerrNG PR #418 primary semantic packet — source positions 1200–1299

## Pin and scope

- Live PR: `snapetech-org/seerrng#418`, open draft.
- Exact head: `6ff9de1c39a19fe9c508f09e0f6a885022632d8b`.
- Tree: `68d7525714b3628bbe7b69701d8be08add152832`.
- Base: `221d8e0d542802da7529cd272c928cc747677e5c`.
- Source catalog: `src/i18n/locale/en.json`, blob `12e04a118c30b71b3714291adeaf9fdb2735cee4`.
- Source insertion positions: 1200–1299 inclusive, 100 IDs × 12 direct locales = 1,200 cells.
- The window is disjoint from reviewed positions 0–1199 and from all matching IDs in the reviewed root disposition evidence.

## Primary dispositions

| Disposition | Count |
| --- | ---: |
| accept-current | 1095 |
| propose-correction | 78 |
| propose-refinement | 27 |


There are 105 exact-target candidates across both correction and refinement dispositions. Each candidate row records the current and proposed target hashes, source hash, locale, exact head/tree and language-specific rationale. They are review proposals and have not been applied to the repository.

## Caller and catalog re-attestation

- 1,200 current translation cells plus 100 English source rows are pinned.
- 207 caller references across five source files and 206 unique caller lines were re-attested at the exact head.
- All 12 target catalogs have 9,494 keys.
- Six source IDs have definition-only coverage with no direct use found at this head (five ExternalMediaManageSlideOver labels and FollowButton.unfollow); this accounts for 72 locale cells. Their status is recorded per cell.
- Candidate/current/source placeholder sets, markup tags and the `SeerrNG` product literal were checked; no parity failures remain.
- Prior frozen-disposition intersection count: zero.

## Limits

This packet is a machine-assisted primary semantic review. It has not received native-speaker signoff or browser review. No repo/PR files, workflows, tests, builds, scans, CI jobs, releases, tags or merges were changed or run.

## Packet files

- `manifest.json` — live PR, source/tree/catalog pins, window and disposition counts.
- `summary.json` — scope, counts, validation and review limitations.
- `source-current-attestation.jsonl` — exact source/current hash records.
- `selected-direct-locale-cells.jsonl` — 1,200 source/current locale rows.
- `source-contexts.jsonl` — source definitions, use references and context coverage.
- `caller-context-attestation.jsonl` — exact caller line/blob/hash records.
- `primary-review-ledger.jsonl` — complete per-cell disposition, proposal and parity records.
- `candidate-proposals.jsonl` and `candidate-hashes.jsonl` — exact proposal targets and hash index.
- `preserved-prior-routing-rows.jsonl` — empty; there are no intersecting frozen prior dispositions.
- `prior-disposition-boundary.json` — exact overlap scan evidence.
- `locale-a/` and `locale-b/` — checksum-verified locale subpackets with independent per-cell semantic reasoning and separate narrator-consistency addenda.
- `prepare_packet.py` and `finalize_primary.py` — scratch-only reproducibility tools.
- `SHA256SUMS` — integrity hashes for packet artifacts.
