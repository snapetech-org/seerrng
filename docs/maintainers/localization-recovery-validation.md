# Localization recovery validation

This is an integration checkpoint for original PR #418, not release acceptance.
The original Git history is preserved on the recovery branch. Published v3.72.10 excludes this work. PR #575 remains pending final combined CI
and the remaining acceptance checks.

## Source and focused repairs

- Merge conflict resolution retains current shared UI owners, request policy and
  requester-tag behavior, and all three built-in themes.
- Explicitly opaque API text remains unchanged even when it matches a known
  application phrase. Fallback language metadata belongs to each loaded catalog;
  English fallback text is labeled English, and blank values inherit fallback.
- Twenty ICU syntax failures and fifteen caller argument/escaping mismatches were
  repaired. One corrupt model value containing an unknown-token marker now falls
  back to English. The previous values remain in task evidence.
- Expired provenance/equivalence evidence was removed instead of restamping
  approval. Missing review records continue to mean unreviewed.
- Generated registry files use the repository formatter, and shared UI contracts
  retain dimensions while checking the corresponding logical CSS properties.

## Completed validation

Production build, client/server types, ordinary i18n checks, repository format,
four API text rendering cases, all 46 contract regression cases, and 73 shared
visual checks passed at the checkpoint. Ordinary catalog checks still report
translation gaps and mismatches; their passing exit does not certify coverage.

Headless runtime captures cover `/profile/settings/main`, `/settings/main`,
`/settings/users`, and `/settings/services` in seerrNGJ, seerrOrig and persiusNG at
390×900 and 1440×900. Twelve candidate cases cover English and Arabic; six matching
English baseline cases cover the preceding production source. A separate case
saves browser-default Arabic, reloads, checks document language/direction, and
checks overflow at 390×844 and 1280×900.

Eight baseline/candidate contact sheets were inspected for geometry, alignment,
spacing, typography, surfaces and overflow in the top viewport. The profile adds
metadata-language and regional-format controls using its existing form rows.
General, Users and Services retain their preceding English layout. Initial test
failures used the admin-only content selector on the profile page or required an
explicit `dir=ltr` attribute absent from the baseline; those harness assumptions
were corrected and their failure artifacts retained.

Protected-token review repaired 18 real catalog defects, including Plex URLs,
HTTP/HTTPS literals, code paths and Telegram commands. Six Japanese/Chinese URL
examples differed only in sentence punctuation; the shared validator now permits
that punctuation while its regression test still rejects changed hosts, ports,
protocols and query values. Protected-token diagnostics are zero. The ordinary
i18n check, focused URL regression and changed-file formatting passed. These
catalog edits are included in the successful production build and subsequent
27-case guarded browser run.

A subsequent caller-argument pass repaired 12 values: translated identifiers,
omitted dates/version numbers, and an Italian plural that omitted its visible
count. All 12 render with React Intl and supplied caller values; the Italian
result displays the count. Contract diagnostics fell from 159 to 148, with no
stale provenance records or invalid ICU syntax.

A real loader/React Intl regression reproduced stale missing-tag/argument
failures and hard-coded Plex playback text for Jellyfin. The repair backlog
preserves 110 outdated translations with source/target hashes and specific
reasons; those active entries now use the existing parent/English fallback.
They remain coverage gaps, with no approval stamps or validator exceptions.
Another 29 values retain translated prose while fixing zero-day quota windows,
minute schedule arguments, missing language/provider/application values and
count/negative emphasis. All 29 format with real caller values; the 22 quota
messages were probed at 0, 1 and 7 days. Six permanent loader regressions pass.

The nine remaining contract diagnostics are caller-verified numeric grammar
variations: Czech day plurals, Danish/Norwegian ordinal interval wording,
Hungarian season nouns and Italian remaining-count plurals. All nine format
without errors at 1, 2, 7 and 30 and display their supplied count. Their original
locale grammar is preserved. The strict validator still reports these differences;
no comparison was weakened or exception added. This establishes formatting
compatibility, not native-speaker approval.

## Remaining acceptance and exclusions

- Empty/obsolete keys, untranslated additions since the original branch, and
  plural/review coverage remain visible. Arabic captures contain English fallback
  for newer feature copy, including streaming-policy and some Persius labels.
- No native-speaker approval is claimed. Matching visual comparisons now also cover movie/TV details and collection
  summary cards, as recorded below. Dialogs, additional languages and regional
  formatting still require acceptance; formatter tests do not prove delivery.
- No live provider account, production database or external message delivery was
  used. Tests run against isolated seeded runtime configs with offline guards.

Evidence and screenshots are retained under
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`,
including `localization-*-visual-review.jpg`, browser logs/traces, repair ledgers,
and `localization-english-baseline-candidate-diagnostics.json`. Pixel differences
are diagnostics, not automatic acceptance thresholds.

The complete tooling run after these repairs passed 366 tests with four skips
and no failures. Client types also passed. The first combined build stopped
on stale API source line references after merging the Plex PIN hardening;
regeneration updated only callsite locations in the source-bound inventory.
The subsequent combined production build passed. Final integration with the
latest dependency milestone and full CI remains pending.


## Browser and shared summary-card repair checkpoint

The guarded runtime passed 27 Playwright cases: browser-default Arabic, twelve
English/Arabic settings cases, twelve collection-selection cases, and movie/TV
responsive detail cases. Collection coverage spans three themes, English/Arabic,
and 390/1440px; detail assertions span 320, 360, 375, 390, 412, 768, 1024, 1440
and 1920px. Six matching English collection baselines and four movie/TV
390/1440 contact sheets were visually inspected alongside all six collection
contact sheets. Existing Orig phone stacking and Persius three-column geometry
remain intact. No physical phone, Safari or Firefox claim is made.

Three actual cascade defects were reproduced before repair. The NGJ desktop
poster was 136px while the more-specific base grid retained an 80px track.
Matching the existing desktop selector specificity fixes the steady state.
The shared summary-card transition previously animated grid geometry during
resize, allowing its track to lag behind the poster; its existing owner now
transitions paint properties only. Collection cards supply selection, poster
and copy, but NGJ and desktop Orig allocated only two columns. Their existing
grid owners now consume the optional existing 16px selection track. This does
not change poster dimensions or the intentional Orig phone stack.

All 73 UI style contracts, client types and the production build passed after
these source repairs. Baseline failure traces and candidate geometry JSON are
retained in task evidence. Screenshot differences include localized content,
selection state and fixture avatars; no pixel-identity claim is made.

The first CI pass also exposed lazy server formatter initialization, PWA head
metadata during locale bootstrap, stale notification expectations, release-note
schema issues and raw review Markdown accidentally fed to Docusaurus MDX.
The fixes preserve Unicode argument isolation, initialize the formatter before
first use, give PWAHeader its own Head owner, and exclude pr-evidence from public
doc discovery while retaining Docusaurus default exclusions. Fifteen focused
formatter/notification tests passed. The auth/user run passed 266 of 267 tests;
the remaining old greeting expectation was corrected for isolation and passed
on focused rerun. Generated API docs plus the full documentation build passed
with persistent webpack caching disabled after shared-cache metadata failures;
no shared cache was deleted.

QA correction: some earlier fixture-mode restarts omitted E2E_OFFLINE=true.
Their functional evidence is retained, but only the explicit guarded repeat is
called offline acceptance. The final guarded node process loads
bin/e2e-network-guard.cjs. A separate published-v3.72.10 container runs on an
internal Docker network with outbound access independently confirmed blocked.
The settings capture harness waits for DOM readiness, visible content, selected
locale/theme, direction, overflow and fonts rather than waiting for unrelated
provider health traffic to become idle.

The explicit guarded repeat also passed all ten Cypress layout/theme cases.
The DOM-ready settings harness then passed twelve English/Arabic local cases
and six English cases against the actual published v3.72.10 container.

## Bundle-budget regression

Combined CI 42166116020 rejected the 1145.8KB shared app entry against the
unchanged 1024KB limit. The generated API catalog duplicated all authored
phrases as matcher literals. Matching boundaries now derive from those same
authored defaults using the generator's literal-quoting rules; translations and
provider text never enter that decoder. A permanent test compares every one of
the 2730 reconstructed boundaries with the source manifest. All eleven matcher,
formatter and rendered API-message cases pass. The production rebuild passes
the original budget: app entry 946.0KB, shared total7.44MB, with38on-demand
translation chunks reported separately. No budget or coverage threshold changed.

The first Next16.4.3 browser repeat started before its runtime had finished
loading and failed with connection-refused errors. It is retained as a harness
startup failure, not product acceptance; the next run must wait for HTTP
readiness explicitly.

## Automatic recovery integration

PR576's focused download-recovery repair is included with its original commit
afcb0d6b8. Explicit pauses take precedence over stale failure/seedless warnings
and refresh the stall observation so resuming gets a fresh window. Two real
SQLite baseline tests attempted removal before repair. Four repaired scenarios
and eight existing recovery tests pass, along with server types. The combined
server build passed; regenerated API inventory changes only callsite locations.
Full combined CI remains required before merge.


## Combined browser acceptance and request summaries

The complete combined browser run passed 198 checks, skipped one, and exposed six
fixture/expectation failures. Person credit roles now use the locale conjunction
(`First role and Second role` in English); the recovery check retains its exact
combined-role assertion with the current formatter. Settings search left the
shared fixture in Persius, causing four subsequent Orig-specific filter checks
to fail. Settings search now restores seeded presentation after each case, and
rating/filter checks explicitly initialize it. All 16 search/rating checks pass.
Locale and collection cases also restore English/Orig after their deliberate
Arabic/theme mutations. A final complete-suite rerun remains required.

Eight additional real preference saves/reloads pass: French/Canada,
German/Switzerland, Japanese/Japan, and Portuguese-Brazil/Portugal, each at
390 and 1440 CSS pixels, with independently persisted Spanish metadata language.
This verifies preference mechanics and formatting-region persistence, not native
speaker approval of these catalogs.

Request dialogs exposed another shared-owner mismatch: `.detail-card-poster`
was omitted from the existing theme summary-grid selectors. The base 64/80px
tracks could not hold theme posters of 80/136px (NGJ) or 128/192px (Orig).
The selectors now include that existing poster role without adding dimensions.
All 12 book-dialog cases (three themes, English/Arabic, 390/1440x900) pass poster
non-overlap, dialog bounds, 32px disclosure height, minimum 192px disclosure width,
label fit, expand/collapse, and no submission. Eight baseline cases fail the new
non-overlap assertion. Matching baseline/candidate contact sheets at both widths
were visually inspected for all three themes; Orig uses its existing stacked
phone and proportional desktop rules, and Persius remains unchanged.

Evidence is retained in task deliverables as `book-poster-{baseline,candidate}`,
`book-poster-comparison-{390,1440}.jpg`, and
`settings-theme-isolation-focused.log`. The production build and all 73 shared
style contracts pass. Provider responses are deterministic fixtures; these cases
do not submit real book requests or prove live provider operation.

The affected shared-consumer rerun passed all 34 cases: collection cards across
three themes/two directions/two widths, movie/TV detail layouts at nine widths,
and the feature-recovery settings, follow, movie/TV request-dialog and subscription
checks. Movie and TV requester/streaming dialogs cover 390 and 1440px in NGJ.

## Final native TypeScript fixtures

Hosted native validation found two test files that did not compile under the production formatter and media enum types. The fixtures now instantiate `createIntl<unknown>` to match `IntlInstance` and use `MediaType` enum members, retaining every behavioral assertion. Both files fail before repair and all29notification cases pass afterward. Evidence: `notification-native-types-baseline.log`, `notification-native-types-candidate.log` and `ci-42172934651-failed-native.log` in the retained task evidence directory. No production formatter type was weakened.
