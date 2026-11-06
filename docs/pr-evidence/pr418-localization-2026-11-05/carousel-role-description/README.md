# SeerrNG PR #418 carousel role-description localization

This focused catalog update is pinned to product commit
`4e7a3c7706311382cff79e0a78540d2053895177`, tree
`51f409aec11d771e37299987c5cf296bed4e0278`, parent
`c3089289eb7825dd779a05c79ec570e2060081b7`.

## Source and caller

The English message is `components.BookSeriesSearch.CoverCarousel.roleDescription`
with source text `carousel`. In
`src/components/BookSeriesSearch/CoverCarousel.tsx`, the component defines that
message and passes it to `aria-roledescription` on the book-cover carousel group.
This is assistive technology text; the update changes no visible copy or layout.

## Decisions

All 12 direct rollout cells were reviewed against that caller. Seven values were
corrected: Arabic, Indonesian, Korean, Brazilian Portuguese, Vietnamese,
Simplified Chinese, and Traditional Chinese. German, Spanish, French, Hindi, and
Japanese were retained. The two Chinese catalogs now say “carousel” (`轮播图`,
`輪播圖`) instead of “calories” (`卡路里`). The Portuguese value is normalized
to `carrossel`; the Vietnamese value is localized rather than left in English.

`readback.json` records the old and selected value hashes, resulting catalog
hashes, key positions, provenance hashes, source/caller pins, and the exact
changed-file set. `verify_carousel_readback.py` checks those values against the
pinned product Git tree and the current checkout. The source-delta record now
shows zero pending direct cells. Twelve per-locale provenance entries remain
machine drafts. Runtime fallback code and the English fallback manifest were
not changed; English remains the default for absent out-of-rollout messages.

This is machine-assisted semantic review. These proposals are not
native-speaker-approved. The locale registry therefore remains unreviewed, and
qualified speaker approval remains outstanding. No tests, builds, scans, CI,
browser work, deployment, merge, release, or tag were performed. `git diff
--check` and the packet verifier passed.
