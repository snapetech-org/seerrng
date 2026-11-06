# SeerrNG PR #418 W2600–W2699 exact-hash application plan

This packet combines the sealed primary review, independent cross-review, and adjudication for all 1,200 locale cells. It is an application plan only; it does not modify a repository or PR.

## Exact revision and live branch

- Repository: snapetech-org/seerrng; PR #418 is OPEN and draft=true.
- Base commit: 221d8e0d542802da7529cd272c928cc747677e5c (main).
- Head commit: 9242898e23f7f25d515d10b5b0b51df322e395fb; head tree: 06cfd94ee611684c33e9e78af9d8bb60a2e98825.
- PR branch: codex/seerrng-localization-overhaul-20261028.
- The worktree is clean and at that exact commit, tree, and branch. GitHub PR API, GitHub branch API, and the canonical github remote report the same head.
- all-seven-pr-head-snapshot.json re-queries the seven open localization PRs and records each head commit and tree at 2026-11-02T21:45:30+00:00.
- This worktree maps origin to a local bare mirror; that local mirror ref reports 422072d585074bdd7f8dd3046cbacede69203d6d. It is not used as the canonical PR/head source. See reattestation.json.

## Counts and adjudication

- 1,200 unique cell rows: 100 source IDs × 12 locales.
- Primary review: 1,025 accept-current cells and all 175 proposals (165 corrections, 10 refinements).
- Independent current-value sample: 120 cells (109 stratified plus 11 expanded-context); all remain at current values.
- Additional current-value findings: 19 (15 corrections, 4 refinements); all 19 are accepted.
- Primary proposal resolution: 170 accepted primary target strings, 4 cross-review text revisions, and 1 rejected proposal. The rejection is Arabic at W2627, components.RequestButton.requestupdatesfailed; it retains the current zero branch. It is not one of the 19 additional current-value findings.
- Expected changes: 193 cells (174 accepted primary proposals plus 19 accepted current-value findings). Expected unchanged cells: 1,007.

## Packet files

- cell-application-plan.jsonl: one row for every locale/source cell, with exact source, current, proposal, cross-review, adjudication, and final targets with hashes, caller pins, row hashes, and readback action.
- expected-changes.jsonl: the 193 exact value changes with before/after strings and evidence pins.
- readback-checklist.jsonl: all 1,200 cells, including changed values and values that must remain unchanged.
- reattestation.json: live PR/base/head/tree/branch and worktree evidence.
- all-seven-pr-head-snapshot.json: latest all-seven PR head and tree snapshot.
- input-manifest.json: verified input packet manifests, source/locale catalog hashes, and base blob IDs.
- summary.json: counts and validation results.
- SHA256SUMS: hashes for packet files other than the checksum file itself.

## Application and readback

Apply only on a branch whose PR head, tree, branch, base commit, source catalog blob, and locale catalog blobs match this packet. If any pin changes, regenerate the plan from the new exact head first. Apply only entries in expected-changes.jsonl; do not change any other locale key in this window.

After application, read all 1,200 sourceId keys from the 12 locale JSON files at the resulting commit. For every row, compare the exact Unicode value and SHA-256 over its UTF-8 bytes with readback-checklist.jsonl. All 193 changed cells must equal the planned target and hash. The other 1,007 cells must remain exactly equal to their base target and hash. Reattest the final commit/tree, diff only the planned locale keys, and record readback evidence separately.

Machine-assisted review remains subject to qualified native-speaker signoff and headed-browser review. This packet performs no application, tests, builds, scans, CI, browser actions, releases, tags, or merges.
