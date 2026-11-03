# Blind cross-review seal

Reviewed all 240 cells for source positions W3140–W3159 across 12 locales, against SeerrNG PR #418 exact head `536dfdb7630d5f61fc8a90b82bc33234eb432c9f` and tree `a011ac81dabbcbc46a4a522f1355efc9025fadc1`. Live PR is open/draft at that head. The exact-head source and locale catalogs, selected source order, per-cell current targets, and all 45 pinned caller lines were re-attested with zero per-cell or caller-line mismatches.

## Blind decisions

- 198 accept-current
- 20 correction
- 22 refinement
- 0 hold

Placeholder signatures and markup signatures pass in all 240 cells. All 12 ICU plural targets preserve the source-required one/other branches. The Arabic `one` branch writes “one episode” lexically rather than using `#`; the ICU count selector remains, and the `other` branch retains `#`.

## Limits

Confidence is moderate and this is machine review only; no native-speaker approval is claimed. Caller evidence pins the message-group definitions and targeted render sites, but the packet’s caller search scope is not a full dynamic call graph. The non-English `window.json` catalogSha256 values do not equal the raw SHA256 of the exact-head locale files; direct per-cell source/target text and SHA256 pins were checked against the exact head instead. The primary README summary, primary decisions, and candidate proposals were not opened before this seal.
