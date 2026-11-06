# SeerrNG W2700–W2799 independent cross-review

This is a sealed, read-only cross-review of PR #418 at head `6bc8d0bd3dfb4f8c87c307a3e562e0fd12474118` / tree `44cf1a02d645026872759fa04a7506ee738381e5`. The primary packet is `/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2700-2799-primary-20261102`; its two checksum manifests were verified before review and are attested in `input-attestation.json`.

## Adjudication counts

- 1,200 locale cells checked across 12 locales and 100 source rows.
- 171 primary candidates: accept 170, revise 1, reject 0, hold 0.
- The one revision is W2716 `pt_BR`, moving the translated participle inside each ICU plural branch so singular and plural agree.
- 10 additional refinements were independently surfaced; see `independent-findings.json` and per-cell `cross-review-ledger.jsonl`.
- Cell dispositions: accept current 1,018; accept current with low-confidence note 1; accept primary proposal 170; revise primary proposal 1; additional proposal 10.
- 472 caller references across 6 pinned files passed exact file, line, and adjacent-context checks. All 100 caller-context rows were checked.
- Exact current catalog values/hashes and final values/hashes were checked for all 1,200 cells. Placeholder and markup parity passed for all 1,200; 24 ICU cells were checked and none had invalid syntax.

## Protected names and cited exception

Six real protected-name defects were corrected in the primary packet: Bindery in Hindi (W2757), Bookshelf in Hindi and Vietnamese (W2796), and Bookshelf in Japanese, Brazilian Portuguese, and Vietnamese (W2797). The remaining literal-rule mismatch is W2704 German `Open-Library-ID`, retained as a valid German compound. `external-reference-checks.json` records the official Duden D146 check, the more directly applicable official 2024 spelling rules §50, and Open Library’s official brand spelling.

## Live refs and scope

`live-pr-snapshots-start.json` and `live-pr-snapshots-end.json` capture all seven localization PR head/tree pairs. No PR head or tree moved between snapshots. The SeerrNG worktree was read-only and clean; no repository/PR writes, tests, builds, scans, CI, or browser work were performed.

This is a static machine-assisted semantic review, not native-speaker approval. Confidence is moderate for semantic quality; structural/hash confidence is high. `cross-review-ledger.jsonl` is the cell-level adjudication record. `structural-audit.json`, `caller-pin-reattestation.json`, `input-attestation.json`, and `helper-review-summary.json` contain the supporting checks and independent first-six-locale review summary.
