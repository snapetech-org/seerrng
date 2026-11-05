# SeerrNG PR #418 primary semantic translation review

This review is based only on the sealed candidate-free packet in the parent directory. It is pinned to PR head `77d30ae742aad7245e6e419237fca6a544531e1f` / tree `2c6fe4a0c1c33aa56b01f06a70702f68598509a7`, base/main `2647e15762de0c2285cd9d8ebc6d27ffafce6358` / tree `b6f4acb9debdc1b0a838b50d5ad88aaa467e429b`.

`review-ledger.jsonl` contains 528 complete cell reviews: 516 insertion proposals for the 43 IDs missing in all 12 target locales, followed by 12 refresh proposals for the existing translations of `components.RequestModal.watchAheadActiveForRequest`. The two categories have separate dispositions and source text pins. `proposals.jsonl` contains the same target wording in an import-oriented format. `hold-ledger.jsonl` is empty; all 528 primary drafts are accepted for proposal at moderate confidence.

The review uses 44 pinned source/caller contexts. It treats collection `buffer` as the number of unwatched movies to keep ahead, distinguishes stopping a queue from removing existing requests/downloads, and interprets Episode Queue controls as a per-request episode look-ahead setting. The changed English source now says the request keeps a count queued ahead; all 12 refresh proposals replace the old administrator-default meaning. The Plex setting preserves the per-minute and per-season limits, and the Trakt setup messages preserve the callback path exactly.

The ledger checks placeholder and ICU shape, markup, inline code, numeric tokens, and protected literals against the pinned English source. Product names and technical strings such as `Plex`, `Jellyfin`, `Emby`, `Trakt`, `SeerrNG`, `HTTPS`, `URL`, `TV`, `Plex Pass`, the numeric `30`, the `4K` option, and `/api/v1/integrations/discovery/trakt/callback` are preserved. The Arabic plural option uses a number-of-episodes construction so the one/other ICU shape remains valid without forcing Arabic dual and plural forms into a single noun inflection.

Confidence is moderate for every locale. This is a primary semantic pass; native-speaker review was not performed. No other reviewer proposals were read. No repository, catalog, PR, or workflow files were edited, and no tests, builds, scans, or CI were run.

Run the packet verifier from this directory:

```sh
python3 verify_primary_packet.py
```

It verifies proposal coverage and hashes against the adjacent candidate-free packet and checks translation tokens. The before/after attestation files record that the live PR and remote refs remained at the pinned head/base during this review.

The sealed candidate-free verifier was run at task start and passed before this required child directory existed. The original verifier recursively inventories its packet root, so it would count `primary-review/` as an unexpected addition if run after this review was written. The primary verifier instead validates every original candidate-free root file against the unchanged checksum manifest and confirms the pinned head/tree/base; it does not alter the sealed input.
