# UI localization roadmap

## Locale inventory and fallback

`config/i18n/locales.json` is the source of truth for canonical tags, native
language names, direction, catalog filenames, locale selection, and deliberate
fallback relationships. It currently registers 38 locales, including English.
The four client catalog files `eu`, `kab`, `sk`, and `sl` are inactive and are
not supported language-picker choices. Catalog file presence does not mean a
locale is complete.

English is the fallback for missing translations. Regional relationships are
explicit: `es-MX` inherits from `es`; `zh-CN` and `zh-TW` map to their
Simplified and Traditional Chinese catalogs; Norwegian Bokmål and Portuguese
regional tags retain their canonical API and stored codes. Do not copy English
strings into translation files to make coverage appear complete.

Run `pnpm i18n:check` to check extracted English sources, generated registry
artifacts, server message surfaces, and catalog structure. Its report describes
direct translations, inherited values, review states, approved English
fallback, unaccounted gaps, and plural warnings. The ordinary check does not
make a locale complete or certify translation quality. Previous dated coverage
counts are historical; use the exact current tree when reporting new totals.

## Translation scope and source integrity

Translate application labels, help, accessibility text, dialogs, empty, error,
and success states, workflow labels, and server notification copy. Keep
user-supplied titles, names and paths, sample data, product names, commands,
protocol/API identifiers, and provider values unchanged. Preserve fork-specific
keys and their existing values when updating catalogs.

English client and server messages have per-message SHA-256 source
fingerprints. After an intentional English source change, update the source
snapshot and matching runtime/source registries; refreshing fingerprints does
not review or approve translations. Keep API-only dynamic values and unknown
provider text opaque.

`config/i18n/catalog-provenance.json` records translation review state by
source and translated-text hashes. A text edit invalidates the existing record.
Entries remain `unreviewed` until qualified linguistic review is recorded; a
machine draft or structural check is not a human review. The English fallback
manifest contains only explicit temporary exceptions with an owner, reason,
expiry, source hash, and catalog domain.

## Coverage and review gates

For each direct locale, check source coverage, key parity, non-empty targets,
placeholders, ICU arguments and types, rich-text tags, URLs, inline code,
protocol literals, and plural behavior. Text-only similarity is not enough to
select a translation when the same English label appears in different contexts.

- `pnpm i18n:catalogs:strict` rejects unaccounted missing or English-identical
  values, malformed ICU, argument/tag/token mismatches, unregistered catalogs,
  and incomplete plural categories.
- `pnpm i18n:catalogs:review` is the message-level human-review gate. It remains
  incomplete until every translation has a current review record.
- `pnpm i18n:registry` regenerates server locale types and the lazy client
  loader; `pnpm i18n:registry:check` verifies generated files are current.
- `pnpm i18n:snapshot` refreshes source fingerprints after an intentional
  English source update; it does not mark translations reviewed.

Structural checks establish catalog consistency, not meaning, tone,
accessibility, or fit. Review translated copy with its production caller,
including placeholders, markup, capitalization, punctuation, and fragment
composition. Keep previously correct locale-specific wording when it fits the
caller.

## Direction, bidi, and formatting

The client derives document direction from the locale registry after a locale
loads. Arabic and Hebrew are RTL. `BidiText` isolates external mixed-direction
text without altering stored values. A per-user regional format preference
controls React Intl dates, numbers, and byte units while preserving the
interface language; metadata language remains a separate preference.

The server-rendered document uses a validated locale-hint cookie, then
`Accept-Language`, to choose `lang` and `dir`. The cookie is a presentation hint,
not authentication state. A blank per-user display-language preference follows
`navigator.languages`; inferred values are not written back as explicit user
settings. The Next page renderer does not load the authenticated user session,
and app translations still load client-side, so this does not guarantee the
saved locale on the first request or translated server rendering. Full
authenticated SSR locale hydration remains open.

Runtime durations, playtime, byte quantities, numeric metrics, and selected
natural-language lists use shared Intl/CLDR formatting. Canonical API, storage,
and provider values remain unchanged.

Shared layouts should use logical inline alignment, spacing, borders, and menu
anchoring. Mirror directional affordances only; preserve media timelines and
numeric control semantics. Email templates declare recipient language and
direction and isolate mixed-script content, but still need rendered RTL review.

## Browser and release acceptance

Before describing a locale as complete, review translated copy in the running
application at desktop and narrow widths. Check accessible names, announcements,
keyboard and focus order, screen-reader reading order, text expansion, CJK,
200% text, and both interface themes. A browser check of setup or calendar does
not certify other routes. The document direction attribute alone does not
establish correct RTL layout.

Machine-assisted translation and semantic review do not establish
qualified-speaker approval. Record language-specific reviewer evidence and
current source/text hashes. Keep browser acceptance, visual RTL review, and
native-speaker approval as separate gates. Do not claim release readiness from
catalog parity or a passing structural check.

## Current-main recovery validation (2026-11-06)

The historical localization branch is being integrated with the current shared
UI owners and three built-in themes. This integration is not accepted or released
yet. A passing ordinary catalog check is not full translation acceptance.

Expired source/target or callsite evidence has been removed from 576 provenance
and 120 equivalence records, with originals retained in the recovery evidence.
Those translations remain unreviewed; no approval hashes were restamped.
English source fingerprints were regenerated after incorporating current main.

The integration repaired 20 malformed ICU values without rewriting translated
prose, quarantined one corrupt model value containing `<unk>` to English fallback,
and restored 15 caller-provided argument names or escaping contracts. The source
and target values for every repair are retained. Remaining argument/tag and
protected-token mismatches still require review; grammatical plural differences
must be checked against their callers instead of discarded automatically.

Locale fallback now retains message-language metadata per loaded catalog, so
English fallback API text is labeled English instead of the selected interface
language. Blank translations inherit their parent or English value. Opaque
provider text with explicit null provenance remains unchanged even if it matches
an application-authored phrase. Four component rendering cases pass. These
results do not claim native-speaker review or completed browser/RTL acceptance.
