# SeerrNG PR #418 W3400–W3419 candidate-free input

This packet contains 20 contiguous English source IDs and 240 existing target cells across 12 direct locales. It is pinned to live open/draft PR head `fcbc579f724e50a07dc0e12b00127c4f6084c453` and tree `30e1e5e610e88ba935e482fc7088311d00e214ae`. It contains no semantic review decisions or proposed translations.

Source order boundaries are position 3399 `components.Requests.requestLifecycle`, position 3400 `components.Requests.requestTime`, position 3419 `components.Requests.searchRequests`, and position 3420 `components.Requests.searching`. The source IDs and all target values are pinned to the client catalogs. All 13 selected catalogs (English plus the 12 review locales) have exact SHA-256 and Git blob pins; each has 9494 keys and the same key set. Locale key sequence hashes are recorded separately because catalog ordering may differ.

Caller pins cover the two production component files that define/use the `components.Requests` messages and shared request action copy. Each ID row distinguishes direct static message-property references from definitions, dynamic-key rendering, and same-source text rendered under the separate `components.RequestStatus` namespace. No absent direct reference is inferred from a definition or generic context.

This packet contains no review decisions or proposed translations. Machine review is not native-speaker approval.
