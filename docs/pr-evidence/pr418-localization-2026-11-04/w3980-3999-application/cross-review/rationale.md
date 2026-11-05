# SeerrNG PR #418 W3980-W3999 cross-review rationale

This review audited all 240 source/locale cells against the sealed candidate-free source text, current target text/hash, caller-context bindings, and token diagnostics while reconciling the sealed primary and blind review decisions and proposal targets. The cell-level decision and rationale are in `decision-ledger.jsonl`; this file summarizes the adjudication and disagreements.

## Adjudication

- Cross-review decisions: {'correction': 33, 'accept': 184, 'refinement': 11, 'hold': 12}.
- Primary review: {'correction': 14, 'accept': 204, 'refinement': 10, 'hold': 12}; blind review: {'correction': 30, 'accept': 206, 'refinement': 4}.
- Primary/blind disagreement on 49 cells: 44 disposition differences, 30 proposal-presence differences, and 7 cells where both proposed different text.
- Proposal exposure: the full blind packet was opened before cell-level semantic review; primary proposals were opened after source/context snippets but before the full current-value pass. No row-level decision existed before proposal exposure. Forty-two of forty-four change targets match one or both reviewers’ proposal text; two are cross-derived. This is not a second blind review.
- The cross-review differs from primary on 22 dispositions and from blind on 25 dispositions.
- All candidate-free current cells preserve source placeholders, markup tags, numeric tokens, and protected literals. All primary, blind, and cross-review proposal targets were hash-checked; all preserve placeholders, markup, and numeric tokens, and retain source protected literals.
- The 12 cells at source position 3987 remain hash-only holds because the source term is unresolved in the supplied caller evidence. The German blind proposal is not adopted; it assumes a specific interpretation.

## Material decisions

- Accepted German web-push compounds at positions 3981, 3985, and 3986 need corrected hyphenation; the failure toast at 3982 also states the send failure explicitly.
- The Japanese HTTPS requirement at 3981 is a required hosting condition, so the instructional current phrasing is corrected to a required-state sentence.
- Corrected terminology errors for Authorization/header in Japanese, Korean, Indonesian, and Arabic, and for the Indonesian header controls. These strings are in the HTTP header editor context.
- Kept the Traditional Chinese 網路推播 refinement because the adjacent requirement already uses that term, and applied it consistently to the related test and settings messages.
- Accepted focused grammar/meaning corrections for Hindi, Spanish, French, Brazilian Portuguese, and Simplified/Traditional Chinese where the current text was incomplete, awkward, or ambiguous for the caller.
- Kept low-confidence outcomes for idiomatic Hindi, Arabic, Vietnamese, and Indonesian at low confidence. The artifact does not claim native-speaker or browser validation.

## Hash-only holds

The 12 position-3987 ledger entries omit the raw source/current strings and retain source ID, source text, current-target, caller-context, and hold-reason hashes. Their source and current text remain bound to the candidate-free input packet.
