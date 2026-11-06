# SeerrNG PR #418 W3380–W3399 candidate-free input

This packet contains 20 contiguous English source IDs and 240 existing target cells across 12 direct locales. It is pinned to live open/draft PR head `4d7de2c41b0e6df6cd0b7f7075c9cddd1c6ce160` and tree `6fba2d5985869b4563955b2c338a93e82efb4b22`. It contains no semantic review decisions or proposed translations.

Source order boundaries are position 3379 `components.Requests.pendingImportAttempt`, position 3380 `components.Requests.pendingImportNextRetry`, position 3399 `components.Requests.requestLifecycle`, and position 3400 `components.Requests.requestTime`. The source IDs and all target values are pinned to the client catalogs. All 13 selected catalogs (English plus the 12 review locales) have exact SHA-256 and Git blob pins; each has 9494 keys and the same key set. Locale key sequence hashes are recorded separately because catalog ordering may differ.

Caller pins cover the two production component files that define/use the `components.Requests` messages and shared request action copy. Each ID row distinguishes direct static message-property references from definitions, dynamic-key rendering, and same-source text rendered under the separate `components.RequestStatus` namespace. No absent direct reference is inferred from a definition or generic context.

This packet contains no review decisions or proposed translations. Machine review is not native-speaker approval.
