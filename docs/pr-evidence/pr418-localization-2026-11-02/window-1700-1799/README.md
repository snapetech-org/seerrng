# SeerrNG PR #418 W1700–1799 exact-hash review and application

Primary and independent cross-review covered 100 source IDs × 12 locales (1,200 cells) at PR head `670d1a213179dcc690f27a8b92c2372dba699091` / tree `be2a8a70ef7f86f3499be7c2190a07b3d2d78036`. The reviewers reattested 319 caller-line references and all relevant catalogs, source rows, and prior decisions.

Applied 243 exact-hash corrections/refinements across all 12 locale catalogs: 170 confirmed primary corrections, 30 confirmed refinements, 25 additional corrections, 16 additional refinements, and two revised primary candidates. The other 957 cells remain unchanged, including the frozen Spanish prior. All catalogs retain the same 9,494-key set.

The 24 `emailInvalid` and `passwordRequired` cells remain unclaimed for rendering because the caller evidence is definition-only or single-reference. Three independently approved target corrections were applied to those catalog definitions, without claiming they render. Twelve historical equivalence references were preserved as context only; they lack frozen final-target hashes. Placeholder/ICU argument, markup, and protected-literal checks passed. Native-speaker approval and current-head browser review remain outstanding.

Primary and cross-review packets, exact apply plan, readback, and checksums are retained here. No tests, builds, scans, CI, workflow changes, releases, tags, or merges were performed for this window.
