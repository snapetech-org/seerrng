# SeerrNG PR #418 W3940-W3959 application evidence

This evidence records product commit `f1252f3058c3ce558fd99eb23dc0faa842826e58` from exact input head `a0104b4c84a9c4561020ca72062171b22ffc49f2` / tree `aaa44c8019c58fde7ae796065e8aae7ac11d7a80`. It applies the 48 guarded updates in `cross-audit/apply-plan.json` across 11 locale catalogs. The evidence commit is a separate follow-up containing review records only.

The packet includes complete candidate-free, primary, blind, and cross-review directories with their original manifests and checksum lists. `application-readback.jsonl` covers all 240 direct-locale cells; 48 are updated, 168 remain unchanged, and 24 “Enable Agent” cells remain hash-only holds. The prior 26 hold-hash rows and 214 applied-target rows are preserved byte-for-byte.

`catalog-preimages.json` records all 13 pinned catalogs at the input head. `catalog-postimages.json` records all 13 product-commit catalogs and key-order hashes. The product commit changes only the 11 selected locale JSON files. The apply plan retains each exact current-target SHA guard.

Run the portable verifier after the evidence commit:

```sh
python3 verify_application.py \
  --repo /path/to/seerrng-checkout \
  --review-source-worktree /path/to/clean-checkout-at-a0104b4c84a9c4561020ca72062171b22ffc49f2
```

After pushing and appending the PR body, add `--require-live` to verify the live PR head, branch/pull refs, and exact body append. This verifier does not run tests, builds, scans, or CI.

This is machine-assisted review and readback. Native-speaker approval and browser acceptance are not claimed. No tests, builds, scans, CI, workflow changes, merge, release, or tag were performed.
