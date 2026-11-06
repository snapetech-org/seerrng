# Independent cross-review: SeerrNG positions 800–899

## Scope and pin

This partition reviews the 118 `correction-needed` rows for `ar`, `de`, `es`, `fr`, `hi`, and `id` in primary ledger SHA256 `e5aa2084709df04af2d22b057f74a218db4dee8759e3ce95bedc004b1673a4a1`. The live SeerrNG PR #418 head was pinned and re-attested at commit `85188b1964b6bf473219c566b196d5eda94396e3` (tree `50bb1f456e29259dfe6dd022cea11da625a6cca6`). Each proposed target was checked independently against the English source and caller context.

The six-locale slice contains 600 source/current pairs and 547 unique caller references. All source/current values and hashes, caller file blobs and line hashes, and available adjacent-line context matched at the pinned head. No re-attestation mismatches were found.

## Decisions

- 104 proposals accepted as written.
- 14 proposals refined; final targets and reasons are in `cross-review-ledger.jsonl`.
- 0 holds and 0 no-op proposals.
- Placeholder and markup parity passed for all 118 proposals.
- The 14 prior-routed German rows were copied byte-for-byte into `prior-routing-preserved.jsonl` and were not re-adjudicated.

The 4K help breadcrumb uses the actual SeerrNG route labels. At the pinned source, `SettingsLayout.tsx` maps `/settings/main` to the visible `General` tab; each final target uses its locale’s Settings, General, and Enable 4K labels. For Hindi ChaptarrNG backend paths, the cross-review uses the backend’s localized Settings/General/Host/Security/API Key labels from `snapetech-org/chaptarrng` commit `03274100af783fdffaca4dd8436e163dc6b18795`, file `src/NzbDrone.Core/Localization/Core/hi.json`.

## Evidence files

- `cross-review-ledger.jsonl`: decisions, exact source/current/proposed/final text and hashes, caller references, rationale, and placeholder/markup checks.
- `source-current-attestation.jsonl`: pinned source and current-target hashes for all 600 rows.
- `caller-context-attestation.jsonl`: pinned caller file blobs, line hashes, and adjacent context for 547 unique references.
- `prior-routing-preserved.jsonl`: the 14 original prior-routed rows copied byte-for-byte.
- `summary.json`: counts and evidence pins.
- `SHA256SUMS`: checksums for the evidence files.

This semantic cross-review does not satisfy separately flagged native-speaker reviews. No catalog or repository files were modified; no tests, builds, scans, CI jobs, or pushes were run.
