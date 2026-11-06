# SeerrNG PR #418 W3680–W3699 cross-audit

This packet independently reconciles all 240 target cells across 12 locales at PR head a2f015c040f933eff38e6ef3d9b1ac6050c4957d and tree 9cea70e57de0d65e78dd0cc6fab8f54dbb4e5cfe. The exact source, current target, direct caller, and catalog pins are carried per row in cross-ledger.jsonl. Candidate-free input is retained at evidence/candidate-free-input/, the sealed primary packet at evidence/primary-review/, and the independent blind packet at independent-review/.

The blind ledger was sealed before the primary review directory was opened. Cross-audit compared every source/locale key. 38 cells had a disposition or target difference: 30 disposition differences and 34 target-text differences. The ledger records both proposals, both rationales, the selected final target, and a per-cell adjudication rationale.

The final plan contains 37 proposed catalog updates and 203 no-ops. It preserves all 12 carried position-3632 callerless holds by hash; their target strings are omitted. No new holds were required. The two Hindi baseline omissions of the protected API literal are fixed in the selected targets. Numeric values were rechecked after locale grouping normalization: 1,000, 1.000, and 1 000 normalize equally, and pt_BR 10 mil normalizes to 10,000.

The cross-audit is machine-assisted and has not received native-speaker approval or browser review. The plan is not applied. No repository or PR files were edited, and no tests, builds, or CI were run.

Evidence note: the nested primary-review/verify_primary.py copy assumes the task-root layout and fails when invoked from its nested location. The task-root verify_primary.py passed; this cross-audit verifier independently validates the copied primary rows and pins.

Live PR/branch/pull refs were reattested at the start and end of the cross-audit. See cross-audit-start-live-attestation.json and after-live-attestation.json. The portable offline verifier is verify-cross-audit.py; it validates the copied evidence, all 240 row bindings, token checks, hold fingerprints, plans, live-attestation files, and checksums.
