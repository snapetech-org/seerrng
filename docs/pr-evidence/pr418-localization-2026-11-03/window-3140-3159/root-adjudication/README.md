# SeerrNG W3140–W3159 root adjudication

Adjudicated all 240 cells at PR #418 exact head `536dfdb7630d5f61fc8a90b82bc33234eb432c9f` / tree `a011ac81dabbcbc46a4a522f1355efc9025fadc1`.

Root decisions: 180 accept-current, 35 correction, 25 refinement, 0 hold. Exact-hash apply plan: 60 replacements, 180 no-change cells.

All source/current cell pins and 45 caller lines reattest to the exact head; all locale catalogs contain 9,494 keys and match English keysets. Placeholder and markup checks pass in all 240 cells. All required ICU plural branches are preserved. Arabic W3159 retains the ICU count selector and lexicalizes the singular as “one episode”; this is accepted and documented.

Confidence is moderate. No native-speaker approval is claimed. Caller review is bounded, not a full dynamic call-graph audit. No repo/PR changes, tests, builds, scans, browser work, or CI actions were performed.
