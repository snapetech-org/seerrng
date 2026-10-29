# SeerrNG localization assessment and implementation plan

**Baseline:** `main` at `471271589e28a77a2e1564b2ef4e1c152e7cf103` (2026-10-28).
This is a source and catalog audit. Counts below describe that snapshot and must
be regenerated after catalog changes.

## Assessment

SeerrNG has a useful localization foundation: React Intl/FormatJS, extracted
namespaced message IDs, lazy client catalogs, server-side catalogs, per-user UI
language preferences, ICU messages, a locale picker, and document direction
updates for Arabic and Hebrew. Existing UI and notification code already uses
these systems. The work should extend those conventions.

The catalog inventory at the baseline contains 38 selectable locales including
English, 42 client catalog files, 6,837 extracted English client messages, and
79 English server messages. Four client catalog files (`eu`, `kab`, `sk`,
and `sl`) are not selectable. Keep that distinction explicit in generated
reports; orphan files must not inflate advertised support.

The nonempty client-catalog count is uneven. Twelve selectable non-English
locales have 5,634 of 6,837 messages (82.4%); `es-MX` has 5,519 (80.7%).
The other 24 selectable non-English locales range from 0 to 21.8%. These are
structural counts, not fluency ratings. Some apparently present values contain
English fragments: the Arabic duration label includes “Hour,” and a version
status contains “behind.” Existing locale selection must not imply full
translation until it is verified.

Server catalogs are also uneven: the most complete translations have 76 of 79
messages, while 12 selectable non-English server catalogs are empty. Emails,
web push, and other notification agents must use the recipient's locale
consistently. Keep provider names, user content, URLs, media titles, and protocol
values intact.

Existing RTL support sets document direction for Arabic and Hebrew and shared
CSS has some logical properties. The project localization roadmap explicitly
records that app-wide RTL is incomplete; shared physical left/right rules remain.
The current date formatter uses React Intl, but the byte formatter manually
emits English unit names and decimal strings. UI language, regional formatting,
and metadata/search language are separate per-user preferences in this change.

The current `i18n:check` regenerates and compares only the English client and
server catalogs. It does not gate missing/empty translations, current source
parity in each selected locale, stale review records, Arabic plural categories,
or rendered RTL coverage. The existing localization roadmap still describes a
5,506-message catalog and should be replaced with a current, reproducible
baseline.

## Implementation

### 1. Locale registry and preference behavior

- Create one authoritative locale registry for canonical BCP-47 tags, client
  catalog filename, server catalog filename, native endonym, region/script,
  direction, selectable status, and deliberate fallback parent.
- Generate the language type, picker entries, dynamic client catalog loader,
  server catalog map, locale resource list, and coverage-check inputs from it.
- Reconcile aliases (`zh-CN`/`zh-Hans`, `zh-TW`/`zh-Hant`,
  `nb-NO`/`nb`, `es-MX`/`es-419`, and Portuguese variants). Never silently
  select an orphan catalog.
- Keep interface language, regional date/number formats, and metadata/search
  language as separate user preferences. Add a clear system/browser default
  choice, preserve per-user selection, and use deliberate parent then English
  fallback rules. Expose the resolved language so users can tell when a catalog
  is incomplete.
- Add searchable native language names and locale codes to the picker. Keep
  technical names, stored codes, URL values, and API values unchanged.

### 2. Message and catalog integrity

- Retain namespaced FormatJS IDs and the static message extractor.
- Extend the checker over every selectable client and server catalog. Validate
  exact key sets, nonempty values, ICU parseability, argument names and types,
  rich-text tags, URLs/code spans, and plural branches.
- Report counts by locale and catalog domain: translated, inherited, reviewed,
  draft, intentionally English, and missing. Count a string equal to English as
  unreviewed unless provenance says otherwise.
- Track English source hashes and per-message/per-locale provenance and review
  status. A source edit invalidates affected review status until it is checked.
  Keep machine drafts distinct from reviewed translations.
- Add explicit, expiring English fallback entries with an owner/reason. Reject
  unlisted missing messages and stale fallback entries. No copied English values
  to inflate coverage.
- Put the catalog check in `prebuild` and the repository localization check;
  add regression tests for extraction drift, stale source, placeholders, ICU
  plurals, regional inheritance, empty values, and fallback accounting.

### 3. Translation coverage and language quality

- Complete existing selected catalogs before advertising new ones as complete.
  Preserve their identifiers and user preferences while clearly distinguishing
  supported languages from complete translations.
- Prioritize the current 12 strongest client locales and `es-MX`, then close
  the remaining 24 client catalogs and empty/partial server catalogs. Expand
  breadth only with a maintainable translation source and review path.
- Use machine translation only as a labeled draft. Preserve correct existing
  upstream translations, record sources and licenses, and add a media/request
  terminology glossary. Review source-language text that appears in localized
  copy and correct catalog-specific defects.
- Use complete ICU plural data for each language. Arabic must model zero, one,
  two, few, many, and other where required; validation must not accept a
  mechanically copied English one/other shape as reviewed Arabic.

### 4. RTL, bidi, and formatting

- Audit RTL across navigation, setup/login, discovery, media detail, requests,
  user settings, service forms, calendar, tables, toasts, modal/portal content,
  email, and both built-in interface themes.
- Set `lang` and `dir` correctly in server-rendered HTML and after a
  successful client locale switch. Handle failed and superseded catalog loads
  without mismatch.
- Replace layout-direction CSS with logical properties where the direction
  changes. Mirror directional affordances only; preserve physical media
  controls, playback timelines, and number/keypad semantics.
- Isolate external mixed-direction titles, usernames, paths, and URLs in UI and
  notifications without changing stored values. Test bidi embeddings and
  isolates, including Arabic plus Latin IDs.
- Use shared Intl/CLDR formatters for dates, times, decimals, grouping,
  percentages, durations, bytes, lists, and localized numeric input. Keep API,
  storage, database, and service protocol representations canonical.

### 5. Accessibility and rendered acceptance

- Verify translated accessible names, descriptions, live-region messages,
  keyboard behavior, focus order, calendar controls, and screen-reader reading
  order.
- Add browser tests for Arabic/Hebrew direction and mixed-script content,
  German text expansion, CJK, narrow mobile screens, 200% text, forms, dialogs,
  tables, loading/empty/populated/error states, and both interface themes.
- Record viewports, routes, states, and evidence. Do not mark app-wide RTL or
  translation quality complete based on a direction helper or JSON checks alone.
- Keep native-speaker review and human linguistic approval visible as gates;
  automated structural checks are not fluency certification.

## Acceptance criteria

- One locale registry generates all locale surfaces without orphaned selectable
  choices or filename aliases that disagree.
- The catalog report matches extracted source keys for every selected client
  and server locale; every remaining untranslated value is explicit, visible,
  and attributable.
- English source changes cannot silently pass as reviewed translations.
- Plurals, arguments, dates, numbers, quantities, bidi, and locale fallbacks
  preserve semantic values and canonical API/storage values.
- Arabic and Hebrew are reviewed across representative workflows and themes at
  mobile and desktop sizes, with keyboard and accessibility checks.
- Translation drafts, corrected entries, licenses, and human review are
  traceable. Release notes state actual coverage and do not claim fluency based
  on structural completeness.

## Verification record

This plan is the reference commit for the implementation PR. Record each code
change and its focused validation in the PR as the branch advances. The repo
owner's runner directive requires private ephemeral JIT runners and forbids
hosted fallback. Do not dispatch GitHub-hosted CI or report a workflow as passed
without an actual run under that policy. Machine or AI-assisted translation
remains draft unless a human reviewer records review.

## Comparison with the supplied PlezyNG localization snapshot

The supplied PlezyNG audit snapshot contains 37 selectable locale catalogs and
4,265 English message IDs. Running its read-only checker reported a pass with
18,972 explicitly allowlisted English fallback uses, valid placeholders, and
current source fingerprints. That is a strong freshness and fallback-accounting
workflow, but the fallback count means its pass is not a claim of complete
translation or fluent review.

PlezyNG's catalog metadata records regional parents for `es-419`, `fr-CA`,
`pt-BR`, and `pt-PT`, RTL locales (`ar`, `fa`, and `he`), and
non-translatable terms. Its checker validates placeholder sets, plural
structure, and bidi embeddings, and reports same-as-English values. It does not
record native-speaker approval or prove rendered RTL quality.

SeerrNG has a larger source surface in this snapshot: 38 selectable locales,
6,837 client messages, and 79 server notification messages. Its client catalog
coverage is much less even: 12 locales have 5,634 of 6,837 values (82.4%),
`es-MX` has 5,519 (80.7%), and the other 24 selectable non-English locales
range from 0 to 21.8%. Twelve selectable non-English server catalogs are empty.
These are structural counts, not fluency ratings.

The implementation commits in this PR add a registry, regional client/server
fallback, FormatJS argument/type and rich-text checks, locale-specific plural
category reporting, protected URL/code checks, a visible draft notice, and
per-message SHA-256 snapshots for both English source catalogs. The snapshot
gate is wired into `i18n:check`; it has not been run in the repository
environment. Current non-English catalogs remain marked `unreviewed`, and
the source snapshot does not record per-message linguistic approval. This
implementation also adds an independent metadata-language setting; provider
metadata and search use it, then fall back to the display language.

**Assessment:** SeerrNG has broader catalog scope, while the supplied PlezyNG
snapshot has the more mature localization QA and fallback-accounting workflow.
SeerrNG's coverage is materially less consistent. It benefits from the changes
in this PR, but neither structural check passes nor locale count should be
read as evidence of translation fluency or app-wide RTL acceptance.

## Implementation update (2026-10-29)

The PR now adds an independent per-user metadata language for provider titles
and search; a null preference follows the display language. Metadata requests
use that preference while notifications continue to use the recipient's
display locale. Email templates now carry recipient `lang`/`dir`, localized
reset-password copy, localized email labels, and bidi-isolated names and titles.

Shared CSS and production component utilities have been migrated to logical
inline alignment, spacing, borders, and menu anchoring. Timeline chronology,
centered elements, and physical swipe stamps keep their physical coordinates.
This is code coverage, not rendered RTL acceptance.

Local validation passed server and client typechecks, the shared UI style check,
the 37-test search route suite, focused user metadata-preference coverage, and
email-template rendering checks. `i18n:check` exits successfully but reports
13,681 catalog issues and 519 plural warnings; non-English catalogs remain
unreviewed. The OpenAPI file parses as 3.0.2 with 479 paths and 271 schemas
after removing a duplicated trailing document fragment. Rendered desktop/mobile
baseline comparison and accessibility review remain unverified.
