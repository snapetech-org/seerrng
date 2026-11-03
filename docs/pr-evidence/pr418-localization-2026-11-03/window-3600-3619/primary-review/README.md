Primary semantic review for SeerrNG PR #418 W3600-W3619, pinned to 1fdec93d1b021e4ec7a7c2265230f59d81d2675e / tree 6234854dc0b1e7aee17ef2e819ffc2b5b2e386ce.

The review covers all 240 current target cells across 20 source IDs and 12 locales. Decisions: 215 accept-current, 11 corrections, 14 refinements, and 0 holds. The 25 proposed changes are in selected-direct-locale-cells.jsonl with exact current/proposed hashes, caller references, rationale, and targets.

Candidate-free lineage is explicit: manifest JSON SHA-256 1089646f93bfd96df0e5f0b820da76e9132cc859b6ed9db595c9a891dbcfcd9c; checksum-list SHA-256 fdffd9f94443ad5ac1604f4a1ba4790717ae54e900ce41b1c3a454aca19ab156. These are separate files. All 20 source IDs have pinned direct callers. The input records eight pre-existing protected-literal mismatches: Brazilian Portuguese omits URL at position 3604, and seven locales translate the quoted external Bindery setting name at position 3618. The proposals restore each exact source literal. Final proposals pass placeholder, markup, numeric, and protected-literal checks.

This is a machine primary semantic review, not qualified native-speaker approval or exact-head browser acceptance. No independent blind review is included, and this task makes no repository or PR changes.
