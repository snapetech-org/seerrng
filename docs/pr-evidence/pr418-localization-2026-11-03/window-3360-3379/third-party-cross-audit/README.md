# Third-party cross-audit — SeerrNG PR #418 W3360–W3379

## Live pins and packet verification

- GitHub PR API and `refs/pull/418/head` report open PR head `1586a249e3f86deb7b9410cff50223e5f76209ff`. The commit tree is `d620a906353e9724ba28986103c76b7792c56099`, matching the sealed input.
- All `input-final`, primary-review, and independent-blind package checksum lists passed. The primary and blind ledgers and 240 input rows have identical position-locale coverage.
- Recomputed source and current-target text hashes for every row. Current values match the pinned catalog values. All 13 catalog files match their exact SHA-256 and Git blob pins at the PR commit; all contain 9,494 keys and have equal key sets.
- Verified all 6 caller-file pins and all 54 caller-context hashes/snippets against exact file blobs and lines at the PR commit. Per-ID caller hashes and direct production-reference counts match the input in both ledgers.
- Placeholder checks pass across current, primary, blind, and recommended values. The only ICU source is `olderRequests`; its `count`, `=1`/`other` branches, locale-specific branches, and `#` markers were checked separately. The primary flags report parity for all 240 cells. This window has no markup tags or protected literals in its source text.
- The input explicitly records `orderedLocaleKeySequencesMatch=false` and pins each catalog individually; I confirmed equal key sets and exact file hashes. The historical ordering difference remains a limit of the window packet.
- The accessible local checkout is not the PR head: it was at `a1d39112a4e378a38640dc183e820c646b49665a` with pre-existing status `## codex/seerrng-localization-overhaul-20261028
 M AGENTS.md
?? .next-webpack-dev`. I did not alter it. I read blobs directly from the pinned PR commit object and verified its tree and all source/catalog pins.

## Adjudication

- Recommendations: 183 accept-current, 11 primary candidate, 8 blind proposal, 1 converged proposal, and 37 holds.
- Holds: 3361, 3362, 3363: all 12 locales; 3372: fr. The first 36 holds agree across both reviews because these message IDs have zero direct production references. The French hold is unresolved terminology: “release” versus “version” for the cross-media unavailable-status filter; the pinned caller provides no French terminology guide.
- Reviewer differences are adjudicated cell-by-cell in `third-party-decisions.jsonl`. The ledger includes each current value, both reviewer outcomes and candidates, caller/catalog pins, exact recommendation, and rationale.
- French `No Release Found` remains the only unresolved terminology hold beyond the caller gate. Arabic `Not available` uses a generic masculine refinement with low language confidence; see its row rationale.

## Limits

This is machine-assisted semantic review, not native-speaker approval. The blind packet reports lower confidence for Arabic, Hindi, Korean, and Vietnamese idiom/register. No repository/PR edits, tests, builds, scans, CI, workflow edits, merges, releases, or tags were performed.

## Source ledger hashes

```text
785609bede24b0c96fa03e80a7d82be70ae6a71c438fc10fc23708a65962b22e  blind-ledger.jsonl
8cb2de359dcfd8500f72ccdd70e1447e29835b8db5c83547224b9cc9791b6d73  input-review-input.jsonl
0372879919ded50193d3106935567b83f099b4c4fde7f1b7939e64d8bd48d8b8  input-window.json
d1d5e6039979f92630cd90b803bcecb0bc484d8112ca468b78f44a3e2fd57c91  primary-review.jsonl
```

Final ledger SHA-256: `ce4f0f55aadb98a7561f8dfb16687a497bae750d3371bf97e42bb88b5014f24e`
