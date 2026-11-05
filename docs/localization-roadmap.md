# UI localization roadmap

## Current catalog state

SeerrNG uses FormatJS client catalogs, server notification catalogs, a language
picker, and English fallback for missing messages. Catalog files exist for 42
client locales and 42 server locales, but file presence does not mean the locale
is complete.

The following snapshot was measured from SeerrNG `main` at
`221d8e0d542802da7529cd272c928cc747677e5c` on 2026-11-01:

| Catalog | English keys | Indonesian keys | Missing English keys | Indonesian-only keys |
| --- | ---: | ---: | ---: | ---: |
| Client UI | 6,837 | 5,660 | 1,203 | 26 |
| Server notifications | 79 | 76 | 3 | 0 |

The previous 5,506-client-key and 71-server-key completion claim is stale. The
current `pnpm i18n:check` verifies that the extracted English catalogs match
their sources; it does not require translated catalogs to cover every English
key. Missing Indonesian messages continue to use English fallback.

## Upstream comparison

Seerr [PR #3667](https://github.com/seerr-team/seerr/pull/3667) is an open
attempt to complete the upstream Indonesian catalog. Its 1,714 message IDs do
not overlap SeerrNG's current English catalog, and SeerrNG already has an
Indonesian locale and language-picker entry. The upstream file is therefore not
a drop-in translation update. Identical English labels can also have different
Indonesian translations in SeerrNG depending on context, so text-only matching
is not enough to select a translation safely.

## Translation scope and review

Translations cover application labels, help, accessibility text, dialogs,
empty/error/success states, workflow labels, and server notification copy.
User-supplied titles, names and paths, sample data, product names, commands, and
protocol/API identifiers remain unchanged. Keep fork-specific keys and their
existing values when catalogs are updated.

Before a locale is described as complete, verify every source key has a
non-empty target, preserve placeholders, ICU argument names and types,
rich-text tags, URLs, inline code, protocol literals, and plural behavior, and
obtain fluent-speaker review. Static checks establish catalog structure, not
translation quality. Visual review must also check longer translated copy at
desktop and narrow viewports; the existing Arabic `/setup` and `/calendar`
inspection does not certify other routes or locales.

A targeted scan of the Indonesian client catalog found no remaining Arabic,
Devanagari, Japanese, or CJK text in its existing values. That check does not
replace a fluent-speaker review or establish coverage of missing keys.

## Language metadata and RTL

The document `lang` follows the successfully loaded catalog, and Arabic sets `dir="rtl"`. Failed or superseded locale loads cannot roll back a newer selection. Shared navigation, the setup flow, calendar controls, and common grouped inputs use logical direction-aware layout rules.

The Agent VM browser review on 2026-10-13 verified Arabic `/setup` and `/calendar` at 1280×900 and 390×844. Both pages rendered Arabic with `lang="ar"` and `dir="rtl"`; the calendar controls and empty state fit at both widths. The browser-native month input kept its English month name. The calendar fixture had no release data.

Arabic remains selectable, but this review does not certify every feature page for RTL. The source still contains physical left/right layout rules outside the reviewed shared-shell, setup, calendar, and grouped-input paths. Those routes need an RTL audit before claiming app-wide visual acceptance.

## Follow-up

1. Close the 1,203 client and three server Indonesian gaps only with context-checked translations and fluent-speaker review; retain the 26 Indonesian-only client keys until their use is understood.
2. Inventory coverage for every locale file and distinguish complete, partial, and fallback-only catalogs rather than treating file presence as support.
3. Convert remaining feature layouts to logical positioning and verify representative Arabic workflows at narrow and desktop widths before claiming app-wide RTL acceptance.
4. Keep new UI strings in the existing FormatJS source catalog and check source-key and placeholder parity in CI.
