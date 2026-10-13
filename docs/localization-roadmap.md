# UI localization roadmap

## Catalog completion

SeerrNG keeps its FormatJS client catalog, server notification catalog, language picker, and English fallback. This follow-up populates the application-owned UI catalogs for Spanish (`es` and the existing `es-MX` variant), Simplified Chinese, Hindi, German, Japanese, French, Brazilian Portuguese, Arabic, Korean, Traditional Chinese, Vietnamese, and Indonesian.

The checked catalogs contain 5,283 client messages and 71 server messages per locale. Every English source key has a non-empty target value in all 13 locale files, including the existing `es-MX` catalogs. Indonesian server email and web-push messages are included.

The locale order remains:

1. Spanish (`es`; `es-MX` where already supported)
2. Simplified Chinese (`zh-CN`)
3. Hindi (`hi`)
4. German (`de`)
5. Japanese (`ja`)
6. French (`fr`)
7. Brazilian Portuguese (`pt-BR`)
8. Arabic (`ar`)
9. Korean (`ko`)
10. Traditional Chinese (`zh-TW`)
11. Vietnamese (`vi`)
12. Indonesian (`id`)

## Translation scope and review

The catalogs include application labels, help, accessibility text, dialogs, empty/error/success states, workflow labels, and server notification copy. User-supplied titles, names and paths, sample data, product names, commands, and protocol/API identifiers remain unchanged. English remains the fallback for future missing messages.

Matching upstream values were reused where available. Machine translation and curated common terms filled the remaining entries; some source-language values remain where a model result was unsafe or the text is a product or technical term. Static checks found full source-key coverage and no placeholder, ICU argument/type, rich-text tag, URL, inline-code, HTTP/HTTPS/URL-token, or plural-marker mismatches. These checks verify catalog structure, not translation quality. A phrase-by-phrase native-speaker review has not been completed, so wording and remaining English values need fluent review.

## Language metadata and RTL

The document `lang` follows the successfully loaded catalog. Failed or superseded locale loads cannot roll back a newer selection, and the language picker reflects the requested locale while it loads and returns to the loaded locale if loading fails. The search input uses logical start padding.

Arabic remains selectable and its document language metadata is set correctly. The document direction stays LTR because the shared application still has physical left/right layout rules across many screens. Full-page RTL conversion and visual review at narrow and desktop widths remain open work; this change does not claim RTL layout acceptance.

## Follow-up

1. Request fluent-speaker review for each target catalog, especially Arabic and Hindi.
2. Convert shared and feature layouts to logical positioning, then verify common Arabic workflows at narrow and desktop widths before enabling global RTL direction.
3. Keep new UI strings in the existing FormatJS source catalog and check source-key and placeholder parity in CI.
