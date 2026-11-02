# SeerrNG populated-catalog semantic review, batches 550–599

This evidence package covers 50 sequential review batches (1,568 cells) for PR #418. The review selection was frozen from source head `5a4342176a8325c371a35d489cb01c58283bc983` / tree `98cd64952123c9b678e38250e7819cabb4476448`, using application-source tree `2471ca52d8b94504879e5842e8ffae920a22e180`. The live PR head/tree at review time were `b6935b9f828078a4991b4cbb777b38ef0c0edce5` / `5006af403fd43976b2957e81bce47d4a3401a230`. The frozen source manifest, semantic manifest, and cell plan hashes are recorded in `range-reconciliation-summary.json`.

## Review results

- All 1,568 selected source/current-target pairs matched their exact live hashes.
- 43 batches returned strict-valid model decisions; seven failed batches were manually reconciled from preserved raw evidence. There were no unresolved cells after reconciliation.
- The full range has 159 correction candidates (158 German, 1 Spanish) and 1,409 machine-accepted current values (1,314 German, 95 Spanish). Eight German correction cells were separately adjudicated by the root reviewer; the remaining 151 candidates (150 German, 1 Spanish) await independent cross-review. This package keeps model output and root adjudication in separate ledgers.
- No cells in this range remain uncertain or held. Machine acceptance is not native-speaker approval; native-speaker review remains pending.
- The eight root-adjudicated German corrections were applied to `src/i18n/locale/de.json`. The exact source/current/reviewed-target hashes, root dispositions, and changed-key coverage are in `root-adjudication-ledger.jsonl`, `preapply-attestation-8-root-rows.json`, and `apply-report.json`.
- Focused checks passed for 8/8 changed keys, English/German key parity, nonempty values, duplicate JSON keys, ICU/placeholders and protected literals, numeric parity, and `git diff --check`. No tests, builds, scans, CI, or releases ran.

## Files and checksums

`SHA256SUMS` lists every file in this package except itself. JSONL files use one disposition per target cell. `candidate-plan-for-root-cross-review.jsonl` is the 159-row candidate ledger; `accepted-current-machine-decisions.jsonl` is the 1,409-row keep ledger; `held-uncertain-cells.jsonl` is intentionally empty. `manual-adjudications.jsonl` and `root-adjudication-ledger.jsonl` preserve the eight separately reviewed target decisions.

The raw request, response, error, and recovery artifacts remain under the task scratch directory:

`/mnt/disks/scratch/task-worktrees/localization-20261030/semantic-results/seerrng-v13-5a434217-strict/`

The window runner, reconciliation script, and apply script are included here for provenance. `run-summary.json` is the model runner's aggregate snapshot: it records 574 of 3,599 completed batches and 3,025 pending, excluding the seven manual batch reconciliations; it is not the per-window disposition ledger. The per-window counts are in `range-reconciliation-summary.json`.

Native-speaker approval is false. Browser review does not cover this semantic window. This evidence package does not authorize or claim release readiness.
