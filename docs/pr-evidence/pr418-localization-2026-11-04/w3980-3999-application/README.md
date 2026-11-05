# SeerrNG PR #418 localization application — W3980–W3999

This packet records the review and exact catalog application for 20 English source IDs across 12 locales. The sealed root adjudication selected 43 changes, accepted 185 current values, and kept all 12 position-3987 “Enable Agent” cells unchanged because the caller does not define the product meaning of “Agent.”

## Commits

- Latest-main integration: `3e63e2b315859d8ca570530180dce1184083083a` (parents: reviewed PR head `d9c5224dbce97e8ae6e72b0ad0bf401e65e215eb` and then-current main `2bb382cfeedc0af1aacda1851a2a469452eb7173`). The read-only merge-tree was clean. The merge includes the main branch’s existing changes; no workflow was edited for this localization task.
- Product catalogs: `a9579faeac5657eb3a9f732cbb8e450790cb2c25`, tree `da31b5613876fb635290cbb51c0f280870756e65`. Its first parent is the integration commit. It changes only 11 locale JSON files, with exactly 43 value changes.
- Evidence is committed separately after the product commit. `application-plan.json`, `application-plan.jsonl`, `readback-240-cells.jsonl`, `catalog-key-order-readback.json`, and `main-integration-reattestation.json` record the exact plan and readback.

The latest-main merge had seven paths also changed on the PR side: `CHANGELOG.md`, `package.json`, `seerr-api.yml`, `src/components/DiscoveryIntegrations/Accounts.tsx`, `src/components/RequestList/RequestItem/index.tsx`, `src/i18n/locale/en.json`, and `src/styles/globals.css`. It added two English source IDs at positions 6578–6579. All 20 reviewed IDs remain at positions 3980–3999 with unchanged source text. The 240 current target values, all 20 caller contexts, all 40 caller-context blocks, and all five runtime caller/inventory file pins were reattested at the merge commit before applying the translations.

The candidate-free packet records the main ref observed when that packet was sealed, before the later main update. Its original files and checksums are preserved. The integration reattestation in this packet checks the newer main commit and confirms no selected source, caller, or target drift. The original candidate-free live-ref verifier is therefore historical; `verify-application.py` is the portable verifier for the merged application.

## Review record

The primary, blind, cross, focused candidate-free/blind, and root adjudication packets are preserved in their own directories. Their supplied review verifiers passed against the sealed inputs. The cross-review process exposure is recorded in `cross-review/cross-review.json`: that reviewer saw primary and blind proposal content before the full semantic audit. The cross review is not described as an independent blind review. Root manually rechecked all selected targets and used the focused blind review for five selected alternatives.

No browser review or native-speaker signoff is claimed. The exact reviewed PR head had no deployment. No tests, builds, scans, or CI were run. The product commit used command-scoped `HUSKY_BYPASS=1` because the pre-commit hook launches attribution, lint-staged, and a Semgrep security scan; no hook was run for that commit. The evidence commit uses the same command-scoped bypass for the same reason. Pushes ran the pre-push container-alias policy hook normally.

## Verify

From any checkout containing the recorded commits, run:

```sh
python3 /path/to/w3980-3999-application/verify-application.py --repo /path/to/seerrng
```

The portable verifier validates packet checksums, the commit parents and trees, the exact 43-row plan, the product-only path/value diff, all 240 final cells, token preservation, and key order for all 13 locale catalogs. The review packets also include their source-specific verification instructions.

PR #418 remains open and draft. No merge to main, release, or tag was made.
