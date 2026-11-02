# SeerrNG PR #418 W2400–W2499 hi/id/vi cross-review

This independent static cross-review covers all 300 current cells (100 source IDs × Hindi, Indonesian, and Vietnamese) and all 151 primary replacement proposals at PR head `f20893e57a89827095fa049d8e0475df7ec7170f`, tree `b5a5952fb4f8a37ea5a39286295f153ce9504f52`.

## Result

- Accept primary proposal: 144
- Accept current value: 147
- Revise primary proposal: 4
- Add an additional correction: 5
- Holds: 0
- Primary proposals: 151, including 3 no-ops equal to the current cell; 148 proposals changed the target.
- Structural mismatches in final targets: 0 placeholder/ICU, 0 markup, 0 protected-literal failures.

The four Indonesian revisions are the PersonDetails “request all movies” description, failure, success, and title at W2470–W2473. The caller selects both cast and crew movie credits; the primary wording “dibintangi” limits the meaning to starring/acting credits. Revised targets use “yang melibatkan” to cover every credited role. The success string also now clearly reports completed submission.

Five additional Vietnamese corrections address the generic media term at W2414, W2415, W2452, and W2459, and the PersonDetails “Crew” heading at W2466. The current “phương tiện” can mean a vehicle or means of transport, and “Phi hành đoàn” means an aircraft crew; final targets use “nội dung” and “Đoàn làm phim”.

## Reattestation and scope

The live PR remained OPEN/DRAFT at the exact pinned head/tree during reattestation. GitHub PR API, branch ref, and HTTPS remote branch refs agreed for all seven localization PRs. The Seerr worktree was clean before and after; all 12 catalogs, 1,200 source/current cells, 100 caller rows, 262 caller line references, and the 300-cell primary subset were reattested. All 1,200 prior matches are `semantic-review-required`; there are zero exact terminal prior dispositions.

`crossreview-ledger.jsonl` contains per-cell source/current/proposal/final hashes, exact caller context and pins, placeholder/ICU/markup/protected-literal checks, verdicts, and rationales. `findings.jsonl` records the nine nontrivial changes. `catalog-reattestation.json`, `caller-pin-reattestation.jsonl`, `input-reattestation.json`, and `all-seven-pr-heads.json` record frozen inputs and live refs.

This is machine-assisted static review with moderate confidence. Native-speaker approval remains outstanding; no browser rendering is claimed. Repository files and the PR were not changed; no tests, builds, CI, or browser work were run.
