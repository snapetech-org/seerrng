# SeerrNG PR #418 primary semantic review: source positions 1700–1799

This packet reviews 100 English catalog entries across the 12 direct locales ar, de, es, fr, hi, id, ja, ko, pt_BR, vi, zh_Hans, and zh_Hant (1,200 cells).

## Pin and method

- PR #418 was OPEN/DRAFT at exact head 670d1a213179dcc690f27a8b92c2372dba699091 and tree be2a8a70ef7f86f3499be7c2190a07b3d2d78036 during input attestation.
- Source positions are zero-based insertion order in the pinned flat src/i18n/locale/en.json catalog.
- Each row records exact source/current/candidate/final text and SHA-256, locale file blob/digest, and caller-context file/line pins.
- Two warning strings (emailInvalid, passwordRequired) have only their message-definition line in the targeted caller file. The pinned UserWarnings component visibly renders emailRequired and profileIncomplete but has no direct use of those two definitions. They are flagged as caller-evidence gaps, not asserted to render.
- One exact prior Spanish acceptance for components.IssueModal.CreateIssueModal.issueType is preserved with its frozen target and hashes. Twelve historical reuse-equivalence references are retained as context, but had no frozen final-target hash and were independently reviewed.

## Review summary

- Accept current: 997
- Propose correction: 172
- Propose refinement: 30
- Preserve prior disposition: 1
- Holds: 0
- Candidate placeholder/ICU mismatches: 0
- Candidate markup mismatches: 0
- Candidate protected-literal mismatches: 0

All required title, maxLength number, language, and repeated commitsBehind ICU arguments are retained exactly. Strong markup is preserved. HD, 4K, SeerrNG Main, SeerrNG Stable, and Tunerr are treated as protected literals.

No repository/PR changes, tests, builds, scans, CI, or browser actions were performed. This machine review is not native-speaker approval.

## Packet files

- primary-review-ledger.jsonl: one semantic-review decision per source ID and locale, with exact hashes and validation checks.
- source-current-cells.jsonl: frozen source/current catalog evidence.
- caller-contexts.jsonl: pinned caller files, line text, and adjacent lines.
- source-window.json: exact source inventory and insertion positions.
- prior-disposition-boundary.json: prior packet/historical-disposition scan.
- input-manifest.json and INPUT-SHA256SUMS: input attestation.
- prepare_input.py and build_review.py: scratch-only preparation and review scripts.
- summary.json, README.md, SHA256SUMS: review counts and output integrity manifest.
