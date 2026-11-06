# SeerrNG PR #418 primary semantic review: source positions 1800–1899

This packet reviews 100 English catalog entries across the 12 direct locales ar, de, es, fr, hi, id, ja, ko, pt_BR, vi, zh_Hans, and zh_Hant (1,200 cells).

## Pin and method

- PR #418 was OPEN/DRAFT at exact head 78a36214596544e1b3033c6a612ae5559db713e3 and tree ef83a00d078f0a4aed6269b4c23282dbf91fd6f7. The same live values were rechecked after the review.
- Source positions are zero-based insertion order in the pinned flat `src/i18n/locale/en.json` catalog.
- Source, all 12 locale catalogs, all 1,200 current cells, 371 caller line references across 11 source files, and prior-disposition boundaries were re-attested at the exact tree.
- No exact prior final dispositions applied to this window. The earlier packet scan returned 1200 rows marked `semantic-review-required` without a frozen final target; those were not treated as accepted translations. Two older `reuse-equivalence-decision` notes without target hashes remain linked as historical context only.
- Six keys have only a definition/single reference in the targeted caller files: components.LiveTv.RecordingList.oneAiring, components.Login.demoModeInfo, components.Login.initialsignin, components.Login.initialsigningin, components.Login.quickconnecterror, components.Login.servertype. Their 72 locale cells remain in the ledger with `callerClaim: unclaimed`; this packet does not claim those strings render.

## Review summary

- Accept current: 776
- Propose correction: 343
- Propose refinement: 81
- Holds: 0
- Candidate placeholder/ICU mismatches: 0
- Candidate markup mismatches: 0
- Candidate protected-literal mismatches: 0
- One current protected-literal typo was found at W1836 French (`IPTV Tuner`); the proposed target restores the exact product name `IPTV Tunerr`.

The primary ledger records exact current/candidate/final text and SHA-256, locale/source file pins, caller lines, disposition, rationale, confidence, and placeholder/markup/protected-literal checks for every cell. Six definition-only/single-reference keys are explicitly unclaimed. No holds remain because the source meaning is clear enough to translate even where runtime use was not found.

No repository/PR edits, tests, builds, security scans, CI, or browser actions were performed. This machine review is not native-speaker approval. `SHA256SUMS` covers all packet files.
