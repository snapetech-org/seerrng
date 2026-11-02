# Arabic episode availability composition follow-up

PR #418 reviewed `components.MediaDetails.SeasonEpisodeTree.available` at source position 2083. The primary review and independent cross-review were pinned to open, draft head `3af7b753f5a7a8ce304e0c116dbce9a76328b3ad` / tree `56a5c443734cee77822fa2a23a2385b2e6dfcf3e`; both packet manifests are retained and verified.

The current Arabic target `متاحة` was replaced with independently accepted `المتاحة`. In the current caller, the value follows the definite phrase `كل الحلقات` in season, all-season, and accessibility selection descriptions. The definite feminine-singular form agrees with the non-human plural noun phrase. The earlier W2000 accept-current disposition is explicitly superseded in the retained cross-review adjudication.

Application changed one catalog cell in `src/i18n/locale/ar.json`. Exact old/new UTF-8 hashes, source and caller pins, all 12 original catalog pins, post-application readback, locale parity, and retained review packets are recorded here. No caller code, tests, build output, workflow, or CI configuration changed.

## Visual and language acceptance

The required baseline/candidate rendered comparison was not available: the Agent Desktop Pool v2 coordinator is unavailable, and no current-head preview/deployment exists. The existing Arabic `/setup` browser evidence covers a different component and cannot validate this selection label. Visual acceptance is unverified and this UI change remains incomplete pending exact-head headed review. Qualified native-speaker approval is also outstanding; machine-assisted reviews are not represented as native-speaker signoff. See [`visual-review.json`](visual-review.json).

## Validation

- Both primary and independent cross-review packet checksum manifests verified before application.
- Live PR and remote branch matched the reviewed open/draft input head before mutation.
- Source, caller, and all 12 catalog files matched their pinned hashes/blob IDs before mutation.
- The reviewed Arabic target changed to the accepted exact string; no other Arabic value changed.
- JSON parsed with duplicate-key rejection; all 12 catalogs retain 9,494 keys and identical key sets.
- `git diff --check` and exact changed-path review are recorded at the application commit.
- No tests, builds, scans, CI, releases, tags, or merges were run or created.
