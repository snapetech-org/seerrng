# Root ratification: SeerrNG PR #418 W3340–W3359

## Provenance

- Exact baseline head/tree: `266d8fff4beb56eab17c9de0f6560c619577e3de` / `5da8f5e38b95b4287821b603c4686fe866b83760`.
- Reconciled 240 unique cells from the exact-head primary packet, candidate-free input, and independent blind ledger. Source/current hashes, caller-context hashes, all 55 context rows, 13 catalog pins, and all six caller file pins match the live head.
- Catalog key sets have 9,494 keys; locale catalogs retain the two pre-existing ordered-key hash groups.

## Root decisions

- 208 cells: accept current.
- 19 cells: apply the independently proposed refinements.
- 1 cell: apply the primary Arabic `Last 6 months` correction, retaining the literal digit `6`.
- 12 cells: hold `components.Requests.manageRequests` because no direct production caller is pinned.
- Total applied values: 20 across 9 catalogs. All reviewed source-number sequences, placeholders, and protected literals are preserved.

For Korean time-range filters, root selected the blind wording `최근 {n}` consistently across 7, 14, and 30 days and 6 months. For the Korean `Incomplete` status, root selected `미완료` because it describes an unfinished request more directly than the existing “imperfect” reading. The blind `Loading Title…` refinements use sentence-style capitalization and preserve the ellipsis.

This is machine-assisted review, not qualified native-speaker approval. Headed product-browser acceptance is not established. No tests, builds, scans, CI dispatches, workflow changes, merge, release, or tag actions were performed.
