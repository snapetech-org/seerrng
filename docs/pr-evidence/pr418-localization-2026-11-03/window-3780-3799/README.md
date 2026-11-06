# SeerrNG PR #418 W3780–W3799

This packet contains the sealed candidate-free inventory, primary review, independent blind review, cross-review, and application readback evidence for the 20 source IDs at positions 3780–3799.

## Result

- PR #418 remains open/draft on branch codex/seerrng-localization-overhaul-20261028, based on main at fa40534ccced75bde1125c14760514fcd5d7de4d.
- Catalog application commit: 39b0010ce37725c7a35af9a5cbc9f0898edd1563 (tree d43e1eb52460e1911f856e024092c1dede0a665d), directly after baseline head 3f57a9a14857b56ec65fe5710050a881aab2730e.
- The cross-review selected 20 targets across 8 locale catalogs: 5 corrections and 15 refinements. The other 220 reviewed cells retain their current values.
- Primary and blind dispositions and proposal sets agree for all cells. They agree on 19 proposed strings; one zh-Hant help-text wording difference was resolved by selecting the primary wording after caller-backed meaning review.
- The current Hindi IP target violated the protected literal check; the selected target preserves IP. All 20 selected targets pass placeholder, markup, numeric, and protected-literal checks.
- All 12 prior holds remain unchanged by hash-only readback; 3,780 prior source selections and source-text hashes match.
- Application readback passes for all 240 cells. Non-target values are unchanged. Exact pre/post key-sequence hashes are recorded for every locale; no insertion, deletion, or reorder occurred within the eight changed catalogs. Sorted-key-set parity with English is checked separately.
- Preexisting insertion-order differences from English are pinned in candidate-free input for zh-Hans, ja, ko, zh-Hant, and vi.

## Review gates

Headed-browser acceptance remains unverified: the pinned head has zero deployments and the persistent VM reaches only the Seerr setup screen; no setup state was changed. Native-speaker and headed-browser reviews remain pending.

No tests, builds, scans, CI dispatches, workflow edits, merges, releases, or tags were performed.

Run python3 verify_window_bundle.py and sha256sum -c SHA256SUMS.txt from this directory to verify the packet.
