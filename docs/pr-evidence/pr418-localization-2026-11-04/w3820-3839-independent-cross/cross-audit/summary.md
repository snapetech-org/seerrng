# Cross-audit summary: SeerrNG PR #418, W3820-W3839

## Pinned scope

- Head: 6c489a64782d31fee70a6aeef386c88527b33083; tree: 9bbf55986a34e9a2bc0c4027205927df65f8754b; base: main at fa40534ccced75bde1125c14760514fcd5d7de4d.
- The audit covers 20 source strings × 12 locales = 240 cells.
- The candidate-free packet, primary review, and blind review each passed their included checksum/verifier checks. The candidate-free packet copied into the blind output is byte-for-byte identical to the kspls0 packet.
- A read-only fetch reproduced the pinned head/tree from the remote refs. All 13 locale catalog files and 4 runtime files match their SHA-256 and Git blob pins. The included Git object proof lets the verifier confirm the exported files belong to the pinned commit offline.
- All 9,494 ordered English source rows, the 20 selected source strings, 240 current target values, 20 caller contexts, and the recorded caller line excerpts reconcile to the exact exported catalog/runtime files.

## Cross-audit dispositions

- Accept current: **219**.
- Accept the primary proposal: **19**.
- Hold for focused review: **2**.
- The primary proposed 20 changes. The cross-audit supports 19; it retains the Arabic compatibility-note wording as a hold pending a qualified Arabic terminology review.
- All eight blind holds were rechecked. Seven have clear correction proposals; Arabic W3828 remains unresolved and held.
- The cross-audit found one additional hold at W3833/id. The Indonesian text explicitly says the provider settings are enabled, while the source and automatic-search caller point to synced indexers. A focused Indonesian review should confirm the intended referent.
- The Japanese W3827 proposal is supported even though the blind review accepted current: the current target omits the source's “otherwise” condition.

## Token and language review

- Placeholder, markup, and numeric-token mismatches: **0** each.
- Protected-literal baseline mismatches: **2** (Hindi API and IP); both primary proposals restore the exact Latin literals.
- Review confidence: **moderate**. Native-speaker signoff is not claimed. The Arabic W3828 and Indonesian W3833/id cells remain held instead of guessing.
- No repository or PR changes, browser actions, tests, builds, CI, release, tag, or merge operations were performed.

## Verification

Run python3 verify-cross-audit.py from this directory or any other directory. The included evidence/ folder contains the source packets, pinned file snapshots, and commit/tree proof needed for offline verification.
