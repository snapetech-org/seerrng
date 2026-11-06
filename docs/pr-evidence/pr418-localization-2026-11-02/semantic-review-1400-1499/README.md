# SeerrNG semantic review: source positions 1400–1499

## Exact input and coverage

- PR #418 was OPEN/DRAFT on `main` at `0773321829173ea9fe6c765d16335c27c06c57a2` (tree `176872baf853ae7278c0c575111bb430026aa454`).
- The review covers 100 English source IDs and 1,200 target cells across the 12 direct locales.
- All source strings, current targets, catalog blobs, and 223 caller references were re-attested at that head.
- Primary dispositions: 365 corrections, 82 refinements, 708 accept-current, 24 holds, and 21 prior dispositions preserved.

## Independent review and application

- Candidate cross-review accepted 446 of 447 proposals and refined one Vietnamese value.
- An independent pass over the 708 accept-current cells accepted 705, refined one, and found two missed issues.
- Root reconciliation applied 450 exact-hash edits across all 12 catalogs. Each catalog retains 9,494 keys. The 24 holds and 21 prior Spanish dispositions remain unchanged.
- Placeholder, markup, and protected-literal failures: zero.

The four cross-review changes beyond accepted primary wording are:

- `vi` `components.IdentityMappingControls.searchFailed`: `Tìm kiếm trong danh mục không thành công. Vui lòng thử lại.`
- `ar` `components.GameLibrary.noGames`: `مكتبة ألعابك فارغة.`
- `ar` `components.IdentityMappingControls.noResults`: `لم يتم العثور على عناوين مطابقة.`
- `ar` `components.IdentityMappingControls.searchFailed`: `فشل البحث في الكتالوج. حاول مرة أخرى.`

The held cells are `components.GameLibrary.request` and `components.GameLibrary.store` in all 12 locales. Their definitions have no direct caller at the pinned head, so the intended noun/action context remains unresolved. The existing 21 Spanish dispositions were retained without reconsideration.

## Limits

This packet documents semantic and caller-context review, not browser rendering or native-speaker approval. Builds, tests, scans, CI, merges, and releases were not run or created for this window.

## Evidence files

- `primary-review-ledger.jsonl` and `candidate-proposals.jsonl`: primary cell decisions and exact proposed targets.
- `candidate-crossreview-ledger.jsonl`: independent review of all correction/refinement proposals.
- `accept-current-crossreview-ledger.jsonl`: independent review of every accept-current cell.
- `primary-holds.jsonl` and `preserved-prior-dispositions.jsonl`: held and previously reviewed cells.
- `root-apply-plan.json` and `root-apply-readback.json`: exact-hash plan and post-write catalog values.
- `SHA256SUMS`: checksums for this evidence directory.
