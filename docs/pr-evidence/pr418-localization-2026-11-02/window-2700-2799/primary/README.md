# SeerrNG PR #418 primary localization review — W2700–W2799

## Exact input and scope

- Live PR: https://github.com/snapetech-org/seerrng/pull/418
- Exact head: `6bc8d0bd3dfb4f8c87c307a3e562e0fd12474118`
- Exact tree: `44cf1a02d645026872759fa04a7506ee738381e5`
- Source catalog blob (`src/i18n/locale/en.json`): `12e04a118c30b71b3714291adeaf9fdb2735cee4`; SHA-256 `75ff3c90b52aedd636a506281ffbd6fb2d3739c61294b6008a517f17647e2316`.
- Window: source positions 2700–2799, 100 source IDs, 12 locales, 1,200 reviewed cells.
- Boundaries: W2699 `components.RequestList.RequestItem.mapTvSeasons` (“Map TV seasons”); W2700 `components.RequestList.RequestItem.mbid` (“MusicBrainz ID”); W2799 `components.RequestModal.Book.pages` (“Pages”); W2800 `components.RequestModal.Book.pendingRequestFormat` (“Pending {format} Request”).

## Review result

- Primary dispositions: {"accept-current": 1029, "propose-correction": 147, "refinement": 24}.
- Candidate edits: 171 proposed corrections/refinements.
- Placeholder and markup mismatches in the source/current pair: 0 and 0; in proposed final targets: 0 and 0.
- ICU cells checked: 24; invalid profiles: 0.
- Spanish: 100 cells reviewed; 7 direct-address entries are formal `usted`; none are informal. Neutral/label entries are marked not applicable.
- Protected-literal checker mismatches: seven total, six true target defects and one overbroad exact-string rule; no cases are held. Keep German `Open-Library-ID`: [Duden D146](https://www.duden.de/sprachwissen/rechtschreibregeln/namen) gives `Rio-de-la-Plata-Bucht` as an example of hyphenating a compound with a multi-part name, supporting this German compound. The six corrected defects are Hindi Bindery transliteration; Hindi and Vietnamese Bookshelf-service translations at W2796; Japanese, Brazilian Portuguese, and Vietnamese Bookshelf translations at W2797. See `protected-literal-assessment.json` and `summary.json`.
- Native-speaker signoff is outstanding; none is claimed.

## Caller and catalog pins

- 100/100 source IDs have exact-head caller-context rows, 472 caller line references across six files. All caller file blobs, line hashes, and adjacent text were rechecked at the exact head/tree. The caller search is targeted to the source group and does not claim a complete runtime call graph.
- All 13 English/locale catalog blob IDs and content SHA-256 values were rechecked at the exact head. `live-localization-prs-end.json` also contains a current seven-PR head/tree and catalog-path snapshot.
- Seven-PR current snapshot:
- snapetech-org/chaptarrng PR #190: `c28d0ab23b2c5454a10237496e642b2ad059d8ce` (tree `bd7a8a32a8bffc2a3168b648ff6e22d368064e5b`), 53 catalog paths.
- snapetech-org/questarrng PR #155: `be131f2d42988bb8f4a271e4df428985da15b53b` (tree `afd827714b9ada51ef269e41184ac219e064059b`), 12 catalog paths.
- snapetech-org/romarrng PR #70: `8e3820252b0c362e18e421b3a73e7ff1478d32a0` (tree `0d29024efd7e5e886926a83d95f57c472f327db9`), 4 catalog paths.
- snapetech-org/seerrng PR #418: `6bc8d0bd3dfb4f8c87c307a3e562e0fd12474118` (tree `44cf1a02d645026872759fa04a7506ee738381e5`), 85 catalog paths.
- snapetech-org/slskr PR #204: `5f295feea832b3078c52d92d9268cd6446f804a5` (tree `22c6c11a817777e2a0df3987acd5fc6bf938c9a7`), 13 catalog paths.
- snapetech-org/slskdn PR #409: `cb6739864b3651d72412b6aeb4590537cbf23d4e` (tree `a0946207555e494a558707008ba051013964b447`), 13 catalog paths.
- snapetech-org/TorrentNG PR #243: `11ff6fa2618e842e92716b7e92867769200e32e5` (tree `770415a3fcd9353884ac245b53798af9610c0aa3`), 13 catalog paths.

## Prior history and boundaries

- `prior-disposition-history-index.json` hashes every prior JSONL evidence file with rows through W2699 and records line-level hashes for the historical primary disposition rows. It does not copy or rewrite repository evidence. Prior primary ledgers cover 2,500 source positions and have no primary ledger entries for positions 100–299; the broader index records 135 positions with no prior JSONL evidence. Missing positions are listed explicitly; no decision is inferred for gaps.
- The previous W2600–W2699 packet is preserved by path and SHA-256 in `prior-history-through-W2699.json`. The selected-window prior audit found 1,200 same-source lookup records: 1,190 still review-required, 10 equivalence candidates, and zero exact live prior dispositions reused.
- The window begins immediately after W2699 and ends immediately before W2800.

## Evidence and operational boundary

- `source-current-cells.jsonl`, `caller-contexts.jsonl`, and the manifest pin the exact input values; `primary-review-ledger.jsonl` contains all 1,200 cell decisions, with exact hashes, rationale, caller refs, and placeholder/markup/protected-literal checks.
- `candidate-proposals.jsonl` contains each material correction/refinement and source references. `candidate-targets.json` is the complete proposed value matrix.
- Material language claims have linked authoritative sources in `language-sources.json` (RAE, Taiwan Ministry of Education dictionary, MusicBrainz and Open Library official sites, and relevant national-language references).
- This packet is sealed in task-scoped scratch. No repository or PR files were edited; no project tests, builds, security scans, CI jobs, browser sessions, commits, pushes, or releases were run for this subtask.
