# SeerrNG PR #418 localization window W3600–W3619

This packet applies the cross-audited decisions for 20 source IDs across 12 locales. It is pinned to the pre-apply PR head `1fdec93d1b021e4ec7a7c2265230f59d81d2675e` and tree `6234854dc0b1e7aee17ef2e819ffc2b5b2e386ce`.

The candidate-free source/caller packet, primary review, blind review, and third-party cross-audit are preserved unchanged in their subdirectories. Their checksum lists and the exact 240-cell source/current/final comparison are retained. The cross-audit found 220 target agreements and adjudicated 20 target disagreements. Nine W3619 disposition differences were classified as corrections because the current literal translations distort the per-user support caveat in the pinned feature-false caller branch.

The applied result is 215 accept-current, 20 corrections, 5 refinements, and 0 holds. Exactly 25 target values changed across all 12 locale catalogs. The 240-cell readback matched every cross-audited target. All 13 catalogs retain their pre-apply key order and the same 9,494-key set as English; all 12 locale catalogs preserve every non-target value. All 8 baseline protected-literal mismatches are fixed. Placeholder, markup, numeric, and final protected-literal mismatch counts are zero.

Run the application verifier from the repository root:

```sh
python3 docs/pr-evidence/pr418-localization-2026-11-03/window-3600-3619/application/verify-application.py
```

The verifier checks the copied packet checksums, pinned source and caller lineage, all 240 exact readbacks, catalog key-set parity/order, and every non-target value against the pinned parent commit. Top-level `SHA256SUMS.txt` covers this packet recursively; each sealed review packet retains its original checksum list.

This is a machine review and static catalog application. Qualified native-speaker approval and exact-head browser review remain pending. No tests, builds, scans, CI dispatches, workflow edits, merge, release, or tag were performed.
