# SeerrNG PR #418 primary semantic review: W2000–2099

This packet reviews 100 English catalog entries across the 12 direct locales (ar, de, es, fr, hi, id, ja, ko, pt_BR, vi, zh_Hans, zh_Hant): 1,200 locale cells.

## Exact input pin

PR #418 was OPEN/DRAFT at head d897f04661802d7f47446e46602f1b521d33c52f, tree 309b846c546923856ffde114fd3cf75a7c8de7a7. The API and remote branch were rechecked before review and again at final reattestation. The isolated checkout was clean at that exact tree.

Source positions are zero-based insertion order in src/i18n/locale/en.json. source-current-cells.jsonl freezes each source string, current locale value, source/current hashes, locale catalog blob and file hashes, and caller-context hash. The source window and all 12 catalog files were pinned to the same tree.

## Semantic review

- Accept current: 817
- Propose correction: 383
- Propose refinement: 0
- Holds: 0
- Candidate targets: 383
- Caller references: 348 line references in 13 source files; all 100 keys have at least one targeted source reference.
- Exact prior final dispositions reused: 0. Earlier evidence contains 1200 matching historical rows, but none had an exact source plus final target equal to the current pinned cell, so those rows remain non-final context only.
- Current placeholder mismatches: 1; final mismatches: 0.
- Current markup mismatches: 1; final mismatches: 0.
- Current protected-literal mismatch cells: 29; final mismatches: 0.

The correction clusters address playback counts, media collection/watchlist actions, quality selectors, disclosure reordering, metadata provider names and licenses, and track labels. The Arabic W2013 plural entry had a missing formatted-number placeholder and malformed markup across ICU branches; its candidate restores the source placeholder and markup structure. All candidate ICU placeholders, markup tags, and protected literals match the English source under the packet checker.

The four components.MediaDetails.DisclosureOrder strings are defined and used in src/components/MediaDetails/ReorderableDisclosureRow.tsx; caller pins include that file and the exact message/use lines. The SeasonEpisodeTree context shows the selectionDescription text is rendered inside selection labels and tooltips, so “available” was reviewed as an episode modifier, not a standalone status label.

## Packet contents and limits

- primary-review-ledger.jsonl has one final decision, exact current/final target, hashes, rationale, confidence, and caller context for every cell.
- correction-candidates.jsonl lists each proposed replacement with its exact target hash, rationale, source/caller pins, and placeholder/markup/protected-literal parity.
- prior-disposition-boundary.json records matching earlier evidence and why no row met the exact reuse rule.
- caller-contexts.jsonl, source-window.json, source-current-cells.jsonl, and input-manifest.json freeze caller/source/catalog evidence.
- INPUT-SHA256SUMS validates frozen inputs. SHA256SUMS validates packet files.

This is an independent model review, not native-speaker approval. No repository or PR files were changed; no tests, builds, security scans, CI, browser actions, workflow edits, releases, or tags were run.
