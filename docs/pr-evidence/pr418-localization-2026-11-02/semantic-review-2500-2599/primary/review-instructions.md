# W2500–2599 primary semantic review instructions

Review all 300 cells in your assigned batch. Each row is pinned to SeerrNG PR #418 exact head `0905d4be32d8b7ec3b1af701473a3fdf6e0f30a2`, tree `a09117211080bbd89d32959f17d93b02a82b966f`. The window is zero-based insertion order in the English catalog positions 2500–2599. Read the caller-context pins, the per-locale `routeGlossary`, and `route-terminology-review.json` before deciding. That note records the two intentional in-window title corrections; use their reviewed labels in breadcrumb proposals while retaining every other route value from the frozen glossary.

For every cell choose exactly one disposition:

- `accept-current`: current translation is semantically accurate and natural enough for this UI context; `finalTarget` must equal `currentTarget`.
- `propose-correction`: current translation has a concrete semantic, grammatical, or terminology error; provide a full corrected translation in `finalTarget`.
- `hold`: source meaning, call-site use, or a safe natural translation is uncertain; set `finalTarget` to null and explain the uncertainty. Use holds rather than guessing.

Only correct material errors or clearly misleading unnatural translations; avoid optional stylistic rewrites. Preserve every source placeholder (including its ICU type), markup, and exact protected literals. Keep product/service names and technical literals exactly as written where they appear in `protectedLiterals`, including BookOrbit, Grimmory, Kobo, Komga, OPDS, SmartScope, and supported formats. Keep the source ICU structure and required `other` branch. Locale-appropriate plural categories (for example Arabic zero/two/few/many) are permitted and may be needed; preserve the `#` count marker in branches that display a count. Do not invent unsupported markup or arguments. If the current text has a placeholder, markup, protected-literal, or ICU integrity problem and a reliable repair is not clear, hold it.

Use caller context to distinguish the reader-service connection, catalog address, shelves/groupings, Kobo collections, library files, and browser/app delivery. Follow the supplied localized breadcrumb glossary for “Settings > Services > Reader Apps” where that route is mentioned. When callers do not support a clear interpretation, hold. Be specific in the rationale, and set confidence to `high`, `moderate`, or `low`.

Write one JSON object per input cell, one JSONL line, to your assigned `*-review.jsonl` path. Each row must contain exactly these required fields (additional explanatory fields are allowed):

```json
{"sourcePosition":2500,"sourceId":"components.ReaderDeliveryLink.ebooks","locale":"ar","currentTargetHash":"...","disposition":"accept-current","finalTarget":"...","rationale":"...","confidence":"moderate"}
```

For a proposal, `finalTarget` must differ from current. For a hold it must be null. Recheck that the output has exactly 300 unique `(sourcePosition, locale)` pairs and no locale outside your assigned batch. Do not edit the repository, pull request, or any files outside this task scratch directory. Do not run builds, tests, scans, CI, or browser work. This is a machine-assisted primary review, not native-speaker approval.
