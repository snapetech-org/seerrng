# SeerrNG PR #418 semantic review: source positions 900–999

This exact-head batch reviewed 100 English message IDs across all 12 direct locales: 1,200 target cells at PR head `18001c2d09d5d271bd4fe2ad22189c29d069a457` / tree `7a9f3218d79501fb620329f0e53c1a0b3dd44508`.

## Review results

- Primary review: 973 accept-current cells and 227 correction proposals.
- Independent review: 1,185 accepts, 13 missed corrections, one wording refinement, and one hold. It re-attested all 1,200 source/current pairs and 218 caller references; source, caller, placeholder, markup, and checked product-literal mismatches were zero.
- The French `deletefail` report was a false positive: the exact current catalog already matched its proposed text and hash. It was reconciled as accept-current/no-op.
- The 227 primary proposals and 13 independently found misses produced 240 catalog edits. Exact source/current/target hashes and placeholders were checked before and after application.

## Spanish setup step fit

The headed Agentic VM review showed Spanish Step 5 `Configurar servicios` overflowing its step segment. Independent semantic review accepted `Conectar servicios` as the shorter translation of `Connect Services`; the post-change desktop review showed that phrase still exceeded the segment’s available label width. A second independent review recommended `Conectar`, which keeps the connect action, matches the neighboring Spanish infinitive step labels, and fits the narrow segment. The service integrations are the clear subject of this setup step. The final target `Conectar` was re-attested and captured at desktop and 400×823 mobile sizes in `../agentvm-browser-review/`.

The shortening is a machine-reviewed fit decision, not native-speaker approval. The screen’s service-connection content supplies the omitted object; native-speaker review remains required.

## Applied changes and evidence

- 241 exact-hash changes across 12 locale catalogs: 240 semantic corrections plus the Spanish setup-step refinement.
- Each catalog retains 9,494 keys. No source or workflow file changed.
- `exact-hash-apply-plan.jsonl` records all original and final values/hashes; `apply-readback-report.json` rechecks the exact base and final targets.
- `primary/` contains the frozen primary packet. `crossreview/` contains the independent packet, including its preserved copy of the primary input.
- `spanish-step5-refinement.json` records the independent fit review and final wording decision.
- `../agentvm-browser-review/spanish-setup-step1-desktop-final.png` and `spanish-setup-step1-mobile-final.png` show the final Step 5 label at desktop and 400×823 mobile sizes. `arabic-setup-mobile-review.png` records the RTL mobile layout. `spanish-setup-step1-intermediate-conectar-servicios.png` shows the intermediate wording and is retained as review history.
- `SHA256SUMS` covers this evidence directory.

No tests, builds, scans, CI jobs, releases, or tags were run or created for this batch. The PR remains open and draft. Qualified native-speaker review and wider application/browser acceptance remain outstanding.
