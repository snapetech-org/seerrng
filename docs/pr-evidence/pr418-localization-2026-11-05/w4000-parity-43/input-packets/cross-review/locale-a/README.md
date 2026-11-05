# SeerrNG PR #418 parity cross-review: locale-a

This packet independently adjudicates 264 cells for `ar`, `de`, `es`, `fr`, `hi`, and `id` against the fresh candidate-free packet and the sealed primary and blind proposals. It is pinned to PR head `f48afa55ce2abeb00ee8b2dc66fa6d2df8f62ba4` / tree `f7ea727b0383397ec8d6220667b4abe151d43b46`, base `2647e15762de0c2285cd9d8ebc6d27ffafce6358` / tree `b6f4acb9debdc1b0a838b50d5ad88aaa467e429b`.

Scope is 258 insertion gaps (43 source IDs × 6 locales) plus 6 existing-target refreshes for `components.RequestModal.watchAheadActiveForRequest`. Those categories remain distinct in the ledger. All 264 cells have a recommendation: 260 accept one of the sealed candidates or their exact consensus; 4 use cross-review adjustments. There are no holds. Every cell keeps its exact current target state, source hash, caller-context hash, old review hashes, and hash-only reattestation row hashes. Selected targets pass placeholder, ICU, numeric, markup, inline-code, and protected-literal checks. The full Trakt callback route and `4K` label are retained.

The 18 context-dependent decisions are all six `components.CollectionQueue.buffer` cells, all six `components.Settings.SettingsJobsCache.movie-collection-queue` cells, and all six changed-source refreshes. Their interpretation depends on the queue selector/job type or the episode-queue request-modal caller; the ledger records each reason. Cross-review confidence is moderate. No native-speaker or headed-browser review was performed.

Live PR API and remote branch/pull/base refs were captured before and after review. Both snapshots show the same open draft PR, head, branch, pull ref, and main base. The local Git objects resolve to the pinned head/tree and base/tree.

Run the portable offline verifier from this directory:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 verify_cross_review.py
```

To also verify the exact local Git objects and rerun the candidate-free verifier against that checkout:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 verify_cross_review.py --repo /home/keith/Documents/code/seerrng
```

The verifier checks this packet, its four sealed inputs, all 528 primary and blind hash-only reattestations, the assigned 264 proposal texts and caller/source/current-target pins, recommendations, token integrity, and before/after PR attestations. It makes no network requests. No repository or PR files were edited, and no tests, builds, scans, CI jobs, or workflows were run.
