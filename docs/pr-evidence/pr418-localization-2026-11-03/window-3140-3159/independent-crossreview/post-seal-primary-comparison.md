# Post-seal comparison with primary review

This file was generated only after the independent blind ledger and its checksum list were sealed. The blind ledger is unchanged. Both ledgers cover the same 240 `(sourceId, locale)` cells at the same exact head.

## Agreement

Exact-head re-check after the blind seal also confirms all 12 locale catalogs contain 9,494 keys and each locale keyset matches English.

- Disposition agreement: 202/240.
- Exact reviewed-target agreement: 185/240.
- Changed cells: blind 42, primary 53, shared 33, primary-only 20, blind-only 9.
- Primary candidate structural audit against source: 0 placeholder/markup/required-branch/# mismatches. Arabic one is accepted as a lexicalized singular branch, with the ICU selector still present.
- Neither review claims native-speaker approval.

## Disposition cross-tab

| Blind | Primary | Cells |
|---|---|---:|
| accept-current | accept-current | 178 |
| accept-current | correction | 8 |
| accept-current | refinement | 12 |
| correction | accept-current | 1 |
| correction | correction | 17 |
| correction | refinement | 2 |
| refinement | accept-current | 8 |
| refinement | correction | 7 |
| refinement | refinement | 7 |

## Source IDs with any disposition or target difference

| Position | Source ID | Source text | Differing cells |
|---:|---|---|---:|
| 3141 | `components.RequestModal.seasonWatchGateLoading` | Checking linked playback history before requesting later seasons. | 2 |
| 3143 | `components.RequestModal.seasonWatchGateStaged` | Only seasons that pass this playback check will be included in the request. {reason} | 1 |
| 3144 | `components.RequestModal.seasonWatchGateUnavailable` | Unable to verify playback history right now. Try again. | 1 |
| 3145 | `components.RequestModal.seasonWatchGateUnknownSeason` | Unable to verify this season against TV metadata. Try again later. | 2 |
| 3146 | `components.RequestModal.seasonnumber` | Season {number} | 1 |
| 3147 | `components.RequestModal.selectAll` | Select every movie that is ready to request | 7 |
| 3148 | `components.RequestModal.selectItemsToRequest` | Select at least one movie to request. | 6 |
| 3149 | `components.RequestModal.selectUnavailableItemsToRequest` | Select unavailable seasons or episodes to request. | 1 |
| 3150 | `components.RequestModal.selection` | Select this movie to request | 7 |
| 3155 | `components.RequestModal.watchAheadActiveForRequest` | This request uses the administrator’s Episode Queue default of {count}. | 8 |
| 3157 | `components.RequestModal.watchAheadAssignedButUnavailable` | Your administrator set Episode Queue to {count} for {owner} TV requests, but it cannot run for this request yet. | 6 |
| 3158 | `components.RequestModal.watchAheadEnabledForAccount` | Episode Queue is enabled by your administrator for {owner} TV requests, with {count} queued ahead. | 11 |
| 3159 | `components.RequestModal.watchAheadEpisodeOption` | {count, plural, one {# episode} other {# episodes}} | 2 |

Per-cell targets and rationales are in `post-seal-primary-comparison.jsonl`.

## Post-comparison packet correction

After this comparison was generated, the root agent corrected the primary packet’s window-level `catalogSha256` fields to the exact-head locale-file hashes and regenerated the primary packet checksums. The corrected primary packet checksum verification passed, and all 13 `window.json` catalog hashes match raw exact-head files. Updated primary `SHA256SUMS.txt` SHA-256: `9b0f356359f6bf9c08109040a271dd0122fc57b29e2e2acb2687060dc5b831e4`. This did not alter the sealed independent ledger; its per-cell exact-head source/current-target strings and hashes remain the cross-review’s attested source of truth.
