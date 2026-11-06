# SeerrNG PR #418 localization review and application - W3720-W3739

This portable evidence window covers source positions 3720-3739 in 12 locales (240 cells). The cross-audit selected 50 updates: 34 corrections and 16 refinements; 190 cells retain their current target. All 12 callerless carried holds at position 3632 remain hash-identical, and there are no new holds. Every selected target passes placeholder, ICU plural category, markup, numeric, and protected-literal checks.

The catalog commit e75479a69f61724ce22f9d626546af9f9ef289f3 (tree 27ea330c330014efc60b8b16f6a536247a981248) is a direct child of 1ca6ec2d5a0e9ef8000c69997e75648a8ccaf06e (tree 6a51f3fb1d1f65c12bfe82bf47834626aa364488). It changes only 12 target locale catalogs. The English source catalog is pinned separately and remains unchanged. No workflow files changed and no rebase was performed.

Contents include the complete candidate-free, primary, blind, and cross-audit packets, along with guarded-application preflight, exact-hash plan, all-cell readback, catalog invariants, hash-only hold readbacks, prior-selection exclusion summary, and portable verifiers.

Run python3 docs/pr-evidence/pr418-localization-2026-11-03/window-3720-3739/verify_window_bundle.py from the repository root. It checks the root and nested cross-audit packet checksums, packet-copy identity, application readback against pinned Git objects, and the committed evidence blobs.

Qualified native-speaker approval and exact-head product-browser review remain pending. No tests, builds, scans, CI dispatches, browser review, workflow edits, merges, releases, or tags were performed for this window.
