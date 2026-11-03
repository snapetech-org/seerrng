# SeerrNG PR #418 W3160–W3179 adjudication

This packet records final decisions for all 240 locale cells at the re-attested live PR head. It also contains a guarded apply plan for the 76 cells whose final value differs from the pinned current catalog.

## Exact scope and live pins

- Repository: `snapetech-org/SeerrNG`
- PR: [#418](https://github.com/snapetech-org/seerrng/pull/418) — OPEN
- Head: `0cc977d2dc5eff86eac49cdad3b9361bff5acd65`
- Tree: `ce65000b9bebef1838f3dd0e1a3764f75e102876`
- Base: `main` at `221d8e0d542802da7529cd272c928cc747677e5c`
- Window: sorted flat `en.json` key positions 3160–3179 (20 IDs × 12 locales = 240 cells)
- English source order: 9,494 keys
- All 12 locale catalogs have 9,494 keys and match the English key set.

The live PR API head and commit tree were rechecked during packet generation. The English source and current locale values were rehashed against that exact commit for all 240 cells. All 12 locale catalog blob IDs were rechecked. The 20 caller-context records and all 40 pinned caller lines were rehashed from the exact-head source files. The status badge’s dynamic `messages[status]` usage has additional exact-head caller evidence in `supplemental-dynamic-caller-contexts.jsonl`.

## Adjudication

`final-decisions.jsonl` has one complete record for each cell: source/current/final text and hashes, both reviewer decisions, the comparison flags, exact caller lines and hashes, structural checks, and the final rationale. The target and disposition disagreements were resolved against the pinned English source and the caller context. Source/current/caller/catalog pin disagreements: 0. Final placeholder mismatches: 0. Final markup mismatches: 0.

Final dispositions:

- `accept-current`: 164
- `correction`: 38
- `refinement`: 38
- Apply-plan rows: 76

The independent comparison recorded 57 target differences and 35 normalized semantic-disposition differences. Every such difference is represented in the final ledger with its primary and independent values and the selected final target. The cross-review differences are reviewer decisions, not source/current pin mismatches.

This is a machine-assisted semantic adjudication. **Native-speaker approval is not claimed.**

## Exact apply plan

`exact-apply-plan.jsonl` lists only changed cells. Each row is guarded by the exact PR head/tree, source catalog blob, locale catalog blob, flat JSON key, expected current value and its SHA-256, plus the replacement value and SHA-256. To apply later, first verify the PR is still at the pinned head/tree and every catalog blob/current-value guard still matches; then apply the rows as one batch. Any failed guard means the plan must be regenerated against the new head. This packet does not apply the plan or modify the repository/PR.

No tests, builds, scans, CI, or browser actions were run.

## Packet files

- `final-decisions.jsonl` — all 240 final decisions and complete evidence
- `exact-apply-plan.jsonl` — 76 exact-hash-guarded replacements only
- `supplemental-dynamic-caller-contexts.jsonl` — extra exact-head status-label caller evidence
- `validation.json` — live PR/tree, catalog, source/current/caller pin, structural, and cross-review counts
- `build_adjudication_packet.py` — reproducible packet builder; reads the two sealed input packets and exact-head Git objects
- `SHA256SUMS.txt` — checksums for every other file in this packet
