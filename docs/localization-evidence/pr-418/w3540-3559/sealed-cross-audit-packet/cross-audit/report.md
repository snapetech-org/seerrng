# SeerrNG PR #418 W3540–W3559 cross-audit report

Pinned head: f15ebead8af7bd09d81c4ea61e8cd3351a2ea66d  
Pinned tree: 3ba2579c326f8dbac943ba43df77ddd5747a85a1  
PR state: open and draft at the cross-audit reattestation.

## Reconciliation

All 240 cells were reconciled across 20 source strings and 12 locales. The primary review proposed 23 changes; the blind review proposed 8. They agreed on 3 proposal targets. There are 21 target differences: 16 primary-only proposals, 1 blind-only proposal, and 4 cells where both proposed different targets. All were resolved using the pinned caller and neighboring field/status context. The reviewers differ on whether to change 17 cells after normalizing their decision labels to proposed-change versus retain-current.

Final disposition: 216 accept-current, 11 corrections, 13 refinements, and 0 holds. All 24 selected cells have exact current/selected hashes in application-plan.jsonl. There are no callerless source positions.

## Selected adjudications

- Rank 3541, Korean: remove the space before the ellipsis in the user-selector search placeholder.
- Rank 3543, Arabic and Traditional Chinese: use direct “show less” labels for the up-arrow collapse control; both reviewers independently agree.
- Rank 3545, German: replace the awkward noun phrase with a direct prompt when the search input is empty; both reviewers agree.
- Rank 3546, Simplified and Traditional Chinese: clarify the Audiobookshelf media-library submit label; the Traditional target also corrects a Simplified character.
- Rank 3549, Japanese: remove the ASCII space after the Japanese full stop.
- Rank 3550, Indonesian: correct the URL Base field label to URL dasar.
- Rank 3551, Spanish: use formal wording, add the natural article, and omit sentence punctuation because this is an option in a select. Japanese: make the empty select option a clear polite instruction to test the connection.
- Rank 3554, French, Hindi, Indonesian, Japanese, Korean, Simplified Chinese, Traditional Chinese: match the helper’s URL Base term to the exact field label. Brazilian Portuguese: state explicitly that the base is what gets appended. Vietnamese: correct the audiobook term and name the appended URL base.
- Rank 3555, Japanese: use an imperative for required-field validation.
- Rank 3557, German: repair negation scope so SeerrNG does not modify Audiobookshelf items. Indonesian: use berdasarkan ISBN to state the matching criterion; this selection is more concise than the blind wording while preserving the full read-only guarantee.
- Rank 3559, German and Spanish: use the exact audiobook-library field context in the required validation. Spanish follows the modal’s formal register.

## Packet and token verification

The candidate-free input, primary review, and blind review checksum lists all verify. All source IDs, current targets, catalog hashes/blob IDs, direct caller lines, and caller-context block hashes match the pinned source snapshot. All 240 current targets match their pinned catalog values at the audited head. The 24 selected targets preserve source placeholders, markup, numeric tokens, and protected literals.

The independent blind verifier and copied-packet verifier pass. The primary and candidate-free verifiers pass. No repository or PR write, test, build, CI action, workflow edit, merge, release, tag, native-speaker review, or browser review was performed. Application approval remains false pending separate parent authorization.
