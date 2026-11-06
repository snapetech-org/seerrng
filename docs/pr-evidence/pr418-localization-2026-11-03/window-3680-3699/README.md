# SeerrNG PR #418 localization application — W3680–W3699

Applied the 37 exact reviewed target changes from the sealed third-party cross-audit at base head `a2f015c040f933eff38e6ef3d9b1ac6050c4957d` / tree `9cea70e57de0d65e78dd0cc6fab8f54dbb4e5cfe`.

The application covers 240 cells (20 source messages × 12 locales): 203 current targets were retained, 27 cells were classified as corrections, 10 as refinements, and 0 new holds. All 12 prior callerless holds at position 3632 were reattested by hashes only and left untouched. The 37 updates affect nine locale catalogs: `es`, `fr`, `hi`, `id`, `ja`, `ko`, `pt_BR`, `vi`, and `zh_Hant`.

`cross-audit/` contains the sealed candidate-free input, primary review, independent blind review, cross-audit ledger, disagreement register, apply/no-op plans, verifier, live-reference attestations, and nested checksum files. The primary task-root verifier passed. Its copied nested `primary-review/verify_primary.py` retains the documented relative-path issue; the cross-audit verifier independently checks all copied rows and pins.

`application/` contains the exact 37-row apply plan, one-shot apply script, 240-row readback, 13-catalog invariants, hash-only hold readback, application result, and portable verifier. Readback confirms all 240 final values match the cross-audit decisions; all 13 locale catalogs retain their 9,494 keys and exact key order, and all non-target values are unchanged. Placeholder, ICU, markup, numeric-value, and protected-literal checks pass. The two Hindi baseline omissions of `API` are corrected.

The PR body will link this packet after the commit is pushed. This machine-assisted review is not qualified native-speaker approval. Exact-head browser review remains pending. No tests, builds, CI, workflow changes, merge, release, or tag were performed.

The sealed cross-audit packet is byte-preserved. Its six source-scratch scripts contain an extra final blank line that triggers Gits default blank-at-EOF check

The sealed cross-audit packet is byte-preserved. Its six source-scratch scripts contain an extra final blank line that triggers Git's default blank-at-EOF check; the adjacent .gitattributes exempts only those six exact paths from that one whitespace warning so the packet's original checksums remain valid. Other whitespace checks remain enabled.
