# UI localization roadmap

## Locale inventory

The locale registry at `config/i18n/locales.json` is the source of truth for
canonical tags, native language names, direction, catalog filenames, selection,
and deliberate fallback relationships. It currently exposes 38 locales
including English. Four client catalog files (`eu`, `kab`, `sk`, and `sl`)
are inactive and do not count as supported choices.

Run `pnpm i18n:check` to verify the extracted English source, generated locale
artifacts, and all selectable client and server catalogs. The catalog report
shows direct translations, English-identical values, missing values, parent
inheritance, plural warnings, and each locale's review status. It does not
equate structural coverage with translation quality.

## Coverage and review status

At the assessment snapshot (2026-10-28), 12 non-English client catalogs had
5,634 of 6,837 messages (82.4%) and `es-MX` had 5,519 (80.7%). The other 24
selectable non-English catalogs ranged from 0 to 21.8%. Server coverage was
also partial, with 12 empty non-English catalogs. These counts describe
catalog contents only.

All non-English registry entries remain marked `unreviewed` until human
linguistic review is recorded. The Settings language picker warns that a
selected catalog may still show English text. The English fallback manifest
contains only explicit temporary exceptions, with an owner, reason, expiry,
and source hash. Do not copy English strings into translation files to make
coverage appear complete.

Use the strict audit when a reviewed translation batch is ready:

- `pnpm i18n:catalogs:strict` rejects missing or English-identical values,
  malformed ICU, argument/tag/token mismatches, unregistered catalogs, and
  incomplete plural categories.
- `pnpm i18n:registry` regenerates the server locale types and lazy client
  loader from the registry. `pnpm i18n:registry:check` checks that generated
  files are current.
- English client and server messages have per-message SHA-256 source
  fingerprints. `pnpm i18n:check` fails when the snapshot is stale; after an
  intentional English source update, run `pnpm i18n:snapshot`. This refreshes
  fingerprints only and does not mark translations as reviewed.

Regional catalog aliases are explicit: `es-MX` falls back to `es`;
`zh-CN` and `zh-TW` map to Simplified and Traditional Chinese filenames;
`nb-NO` and Portuguese regional tags keep their canonical API and stored
codes. Missing entries then fall back to English.

## Direction, bidi, and formatting

The client derives document direction from the registry after a locale is
loaded. Arabic and Hebrew are RTL. The shared `BidiText` component isolates
external mixed-direction text such as media titles without altering stored
values. A per-user regional format preference overrides the territory while
preserving the interface language; it drives React Intl date/number formatting
and byte units without changing the translation catalog. The settings form
uses the supported ISO region list and can return to the display-language default.

The server-rendered document now chooses `lang`/`dir` from a validated
locale-hint cookie, falling back to `Accept-Language`. The cookie is a
presentation hint, not authentication state. The Next page renderer does not
load the authenticated user session, and app translations are still loaded
client-side, so this does not guarantee the user's saved locale on a first
request or render translated text on the server. Full authenticated SSR locale
hydration remains open. App-wide RTL layout and notification rendering also
need rendered review; the direction attribute alone is not RTL acceptance.

This does not certify app-wide RTL layout. Physical left/right rules remain in
feature components, emails, and themes. Review navigation, setup, discovery,
media detail, requests, user settings, services, calendars, tables, dialogs,
portals, and notifications at narrow and desktop widths before claiming full
RTL acceptance. Mirror directional affordances only; preserve media timelines
and numeric control semantics.

The browser review recorded on 2026-10-13 verified Arabic setup and calendar
pages at 1280×900 and 390×844. That is historical, limited route coverage; it
does not establish current app-wide RTL acceptance.

## Translation and release gates

Machine-generated or AI-assisted text remains draft. Preserve upstream source
and licenses, keep a terminology glossary for media and requests, and request
fluent-speaker review for each locale. Check plural categories with the locale's
CLDR rules; Arabic cardinal plurals need zero, one, two, few, many, and other
where those categories apply.

Structural checks do not certify meaning, tone, accessibility, or fit. Review
accessible names, announcements, keyboard/focus order, screen-reader reading
order, text expansion, CJK, mobile widths, 200% text, and both interface themes
before describing a locale or RTL support as complete. The assessment and
baseline are recorded in
[`docs/localization-assessment-2026-10.md`](localization-assessment-2026-10.md).
