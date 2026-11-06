# SeerrNG PR #418 cross-review: positions 800–899

This evidence partition independently cross-reviews the 163 correction proposals for ja, ko, pt-BR, vi, zh-CN, and zh-TW against the English source and pinned caller context.

## Pins and attestation

- SeerrNG PR head: 85188b1964b6bf473219c566b196d5eda94396e3
- Tree: 50bb1f456e29259dfe6dd022cea11da625a6cca6
- Primary combined ledger SHA-256: e5aa2084709df04af2d22b057f74a218db4dee8759e3ce95bedc004b1673a4a1
- Source/current cells re-attested: 600, with 0 mismatches.
- Unique caller references re-attested: 547, with 0 mismatches.
- External ChaptarrNG UI labels were checked against release v0.9.977, commit 03fe58069880160276c90a8f8ded3b6ae8d205e0.

The cross-review corrected the 4K breadcrumb to the visible Seerr settings path, whose /settings/main tab is labeled General. The explicit ChaptarrNG API-key path uses the product’s locale labels. The mixed Bookshelf/Chaptarr/Readarr Base URL path retains its English breadcrumb because the connected provider and its independently selected UI locale can vary.

## Results

- Accepted proposal: 140
- Refined proposal: 23
- Hold: 0
- No-op finals: 0
- Placeholder parity failures: 0
- Tag parity failures: 0
- Prior-routed rows preserved without re-adjudication: 14

The review remains bounded; native-speaker review is still required. No repository files or catalogs were changed. No tests, builds, scans, CI, pushes, PR mutations, or releases were run.

## Files

- independent-cross-review-part.jsonl: candidate rows with independent decisions and final targets.
- source-current-attestation-part.jsonl: exact source/current values and hashes at the pinned head.
- caller-context-attestation-part.jsonl: unique caller blobs, line hashes, and neighboring lines at the pinned head.
- placeholder-tag-audit-part.jsonl: placeholder and markup parity checks.
- no-op-finals.jsonl: empty; no final target duplicates its current translation.
- refinements.json: the 23 refinement targets and reasons.
- seerr-ui-breadcrumb-attestation.jsonl and seerr-settings-layout-attestation.json: pinned Seerr labels and route evidence.
- chaptarrng-breadcrumb-attestation.json: published ChaptarrNG locale labels used for the explicit API-key path.
- summary.json: counts, pins, and blockers.
