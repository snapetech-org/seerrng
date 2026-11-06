# SeerrNG PR #418 W3500–W3519 third-party cross-audit

- Exact parent: `9bb8fd4695b207165e4bb8e56c5239eb50cee37c` / tree `74a4b0208108be4bc593c63c8ac55b4a2df74862`. The pull request is open and draft.
- Coverage: 20 source IDs × 12 locales = 240 cells. All 20 have pinned direct callers in the expected message namespace; all placeholder checks pass.
- Reconciled outcome: 219 accept-current, 6 corrections, 15 refinements; no caller holds. The cross-audit selects 21 target updates.
- Primary and blind review dispositions differ on 18 cells and proposed targets differ on 17. Row-level differences and adjudication are in `disagreement-and-hold-summary.json`; every cell, including no-op acceptances, is in `cross-audit-ledger.jsonl`.

## Adjudication notes

The source word “Try again” is rendered on a button, so the selected French and Hindi targets use natural action forms, Vietnamese removes the conversational particle, and Spanish/Brazilian Portuguese omit sentence punctuation. The search-unavailable copy is corrected in Vietnamese and Traditional Chinese; Traditional Chinese uses `搜尋` consistently and the stray pre-punctuation space is removed. The Simplified Chinese Search Results target is corrected from a mixed-script value. The Indonesian Sort By label is made idiomatic.

CertificationSelector loads country-specific media certification classifications. Spanish, Vietnamese, and Indonesian loading messages use classification wording; the maximum-rating fields in Spanish and Indonesian name that same classification scale. Portuguese `Software` is more precise than `Programas` for the media-type category.

## Validation and remaining acceptance

Input, primary, and blind manifests verified. GitHub reports 0 check runs and 0 deployments for this exact head; no submitted reviews or issue comments were present at audit time. The application readback is not yet complete. Qualified native-speaker approval and exact-head deployed browser review remain pending. No repository files, tests, builds, scans, CI runs, workflow edits, merge, release, or tag were made.
