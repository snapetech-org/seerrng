# UI localization roadmap

## Existing support and verified gap

SeerrNG already uses `react-intl`, separate frontend and server catalogs, a per-user Display Language control, and a Weblate translation workflow. The current frontend tree has 42 locale catalogs, including Arabic, Hindi, Japanese, Korean, Vietnamese, Indonesian, and Simplified and Traditional Chinese.

On the latest `main`, the 43 `calendar.*` messages were absent from every non-English catalog. This PR adds those Calendar strings to `es`, `es-MX`, `de`, `zh-CN`, `zh-TW`, `ja`, `fr`, `pt-BR`, `ar`, `ko`, `hi`, and `vi`. It reuses the existing account language picker and does not create another setting or try to fill thousands of older, unrelated catalog gaps.

## Next implementation steps

1. Keep extracting new user-facing copy into the existing FormatJS source catalog; do not add a second i18n framework.
2. Check new feature catalogs for missing keys and ICU placeholder parity before requesting translation review.
3. Review the Calendar, navigation, filters, dialogs, and account settings in Arabic and Hebrew with the existing `lang` and `dir` behavior; track full-page RTL layout separately.
4. Check selected-locale date and number formatting and translated copy at narrow and desktop widths. Preserve English fallback for any not-yet-reviewed string.
5. Continue the existing Weblate workflow for the long tail of supported locales.

## First-pass locale order

This is a practical rollout order, not a claim about these apps' actual user base. Product-level language analytics are not available. It combines global speaker estimates with online-content usage, and keeps the requested Arabic and Asian-language coverage in the first waves:

1. Spanish (es; es-MX where the product already distinguishes it)
2. Simplified Chinese (zh-Hans / zh-CN)
3. Hindi (hi)
4. German (de)
5. Japanese (ja)
6. French (fr)
7. Brazilian Portuguese (pt-BR)
8. Arabic (ar; requires right-to-left layout support)
9. Korean (ko)
10. Traditional Chinese (zh-Hant / zh-TW)
11. Vietnamese (vi)
12. Indonesian (id)

The World Bank's 2025 report estimates Mandarin Chinese, Hindi, and Spanish at 15%, 7.6%, and 6.9% of the global population respectively; its online-content data also places German, Chinese, and Japanese among the leading languages. [World Bank, Digital Progress and Trends Report 2025](https://documents1.worldbank.org/curated/en/099112525160536089/pdf/P505350-59c98ca8-0803-4f23-b470-17f3dab010ab.pdf). W3Techs tracks website content-language share rather than app users. [W3Techs content-language survey](https://w3techs.com/technologies/cross/content_language%20/ranking). Reorder this list if maintainers later receive reliable demand signals.

## Translation boundaries and acceptance

Translate interface labels, help, empty states, validation, notifications, and errors. Keep media titles, user names, filenames and paths, commands, API identifiers, protocol values, and other user-supplied content unchanged. Use the selected UI language for date, time, number, and plural formatting. Every locale must fall back to English for a missing key; CI should check placeholder parity and report missing strings. Arabic ships only after the app sets `lang` and `dir`, uses logical layout properties, and verifies the core workflows in RTL at narrow and desktop widths.

## Implemented in this PR

The existing language selector continues to use the current locale catalogs, and the application now keeps the document lang and dir attributes in sync with that selection. Right-to-left metadata is enabled for Arabic and Hebrew. Catalog coverage and page-level RTL layout review remain separate follow-up work; this change does not claim the entire interface has been visually validated in RTL.

## Added in this continuation

Indonesian is now selectable in the existing language picker and loads a partial catalog for 91 shared interface messages; all other untranslated UI messages use the English catalog. Empty shared-message values were filled in the existing Spanish, Latin American Spanish, Simplified Chinese, Hindi, Brazilian Portuguese, Arabic, Korean, Traditional Chinese, and Vietnamese catalogs so they no longer render as blank text. Missing keys continue to fall back to English. This does not claim full-catalog translation or complete RTL review.

## Added in this continuation

The Indonesian server catalog now covers the existing email and web-push notification messages, with placeholder parity checked against English. Locale metadata now follows the last successfully loaded client catalog; a failed language chunk keeps the last complete language and direction. The desktop shell, search bar, sidebar, and common dropdown anchors use logical positioning for Arabic. Remaining app-wide RTL and catalog coverage stay tracked separately.
