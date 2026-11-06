# SeerrNG PR #418 primary semantic review: source positions 1600–1699

This read-only packet reviews 100 English source entries across the 12 direct locales `ar`, `de`, `es`, `fr`, `hi`, `id`, `ja`, `ko`, `pt_BR`, `vi`, `zh_Hans`, and `zh_Hant` (1,200 cells).

## Pin and method

- Repository: `snapetech-org/seerrng`, PR #418.
- Live PR state at final re-attestation: OPEN, DRAFT.
- Exact head: `5aceef6ed6e865ee89383738212d1ce1a5c1f552`.
- Exact tree: `dd6e3495c44c2c14acf8a7a4b09a21e935ceb16d`.
- Read-only worktree: `/mnt/disks/scratch/task-worktrees/localization-20261102/seerrng-pr418-w1400-1499` (detached at the exact head; clean).
- Source positions are zero-based insertion order in the pinned flat `src/i18n/locale/en.json` catalog.

The per-cell ledger includes the exact English source and current target, SHA-256 of each UTF-8 string, locale catalog blob and file digest, pinned caller file blob/digest and line references, disposition, rationale, confidence, proposed target and target hash. `caller-contexts.jsonl` retains the relevant caller lines and hashes. The affected-season messages point to the helper that defines and formats them. `manage-labels.jsonl` pins the localized `i18n.manage` labels referenced by the capitalized “Manage” in `IssueDiscussion.addHelp`.

## Dispositions

- Accept current: 1,004
- Propose correction: 141
- Propose refinement: 45
- Preserve exact prior Spanish disposition: 10
- Holds: 0

The 10 frozen Spanish rows are preserved from the exact-hash plan at `docs/pr-evidence/pr418-localization-2026-11-02/semantic-review-600-649/exact-hash-apply-plan.jsonl`. Each ledger row retains the prior current value/hash, proposal/hash, final target/hash, review decision and reason, prior head/tree, and exact source evidence row hash. Those rows were re-attested against this live catalog and were not reopened.

Two catalog definitions have no direct reference in their pinned component file: `components.IssueDetails.IssueMediaSummary.minutes` and `components.IssueList.IssueItem.openarr`. The ledger marks these as definition-only in caller evidence and makes no claim that they render.

All current and proposed named placeholders match the English arguments, including ICU argument types; markup and protected-literal checks show zero mismatches. Runtime placeholders `{arr}` and `{format}` remain intact. No repository/PR changes, tests, builds, scans, CI, or browser actions were performed. This machine review is not native-speaker approval.

## Packet files

- `primary-review-ledger.jsonl`: one reviewed row per source ID and locale.
- `source-current-cells.jsonl`: exact pinned source/current catalog evidence.
- `caller-contexts.jsonl`: exact pinned callers and line references.
- `manage-labels.jsonl`: related localized Manage-section labels used to review `addHelp`.
- `summary.json`: exact pin, counts, and integrity summary.
- `prepare_input.py`, `build_review.py`: scratch-only packet generation scripts.
- `SHA256SUMS`: file checksums for this packet, excluding the checksum file itself.
