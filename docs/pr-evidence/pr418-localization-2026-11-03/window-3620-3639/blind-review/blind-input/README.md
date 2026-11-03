# Blind translation review — SeerrNG PR #418 W3620–W3639

Review all 240 source/locale cells independently using only the English source and exact production caller context in translation-prompts.jsonl. Preserve placeholders, ICU plural syntax, markup, product names, API identifiers, and numeric meaning. Use concise, natural interface language for each locale. When caller context is absent, do not infer a UI meaning; hold the source/locale cells pending a confirmed production caller.

This packet excludes existing locale catalog values, translation candidates, glossary content, and previous review decisions. Do not seek or open those materials. Return one proposal or hold per position/sourceId/locale, with concise rationale, confidence, and explicit placeholder/ICU/markup/numeric/protected-literal checks. Seal the output before any candidate-bearing review is shared.
