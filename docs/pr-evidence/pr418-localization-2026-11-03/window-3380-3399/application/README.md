# Exact catalog application

Applied the 12 targets in `apply-plan.jsonl` to eight direct locale catalogs at the exact W3380–W3399 input head. All 240 reviewed cells were read back against the root ledger. The 12 direct locale catalogs each retain 9,494 keys and their own exact pinned key order.

`apply_exact_head.py` is idempotent only at the pinned pre-change head and verifies source/current/target hashes before writing. `readback.jsonl` records every selected target. No tests, builds, scans, CI dispatches, or workflow edits were made.
