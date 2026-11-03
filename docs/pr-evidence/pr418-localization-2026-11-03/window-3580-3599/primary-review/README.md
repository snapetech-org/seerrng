Primary semantic review for SeerrNG PR #418 W3580-W3599, pinned to 30f626a4626d460f426666cde02f5c1ed17fa206 / tree 9b2616780791c73eb176aca6ad53061f1f3587d8.

The review covers all 240 current target cells across 20 source IDs and 12 locales. Decisions: 216 accept-current, 2 corrections, 22 refinements, and 0 holds. The 24 proposed changes are in selected-direct-locale-cells.jsonl with exact current/proposed hashes, caller references, rationale, and targets.

Candidate-free lineage is explicit: manifest JSON SHA-256 dd52b2201b0d8608edce6953542a6459a627a93647344ec7e009f87c65e1fe56; checksum-list SHA-256 2b54d35d48d2309346383371bf745d747fcd64b016e1e7b6a6d6242c747c67b5. These are separate files. All 20 source IDs have pinned direct callers. The input records one pre-existing protected-literal mismatch: Hindi at position 3586 transliterates IP; the proposed correction restores the exact IP literal. Final proposals pass placeholder, markup, numeric, and protected-literal checks.

This is a machine primary semantic review, not qualified native-speaker approval or exact-head browser acceptance. No independent blind review is included, and this task makes no repository or PR changes.
