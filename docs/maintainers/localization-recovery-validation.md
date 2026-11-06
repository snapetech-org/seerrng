# Localization recovery validation

This is an integration checkpoint for original PR #418, not release acceptance.
The original Git history is preserved on the recovery branch. The release in
preparation excludes this work until the remaining checks are complete.

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
latest catalog edits have not yet been rebuilt into the browser runtime.

## Remaining acceptance and exclusions

- Resolve the remaining 159 argument/tag contract diagnostics. Some plural
  differences may be valid grammar and require
  caller-aware review; do not delete them merely to silence a validator.
- Empty/obsolete keys, untranslated additions since the original branch, and
  plural/review coverage remain visible. Arabic captures contain English fallback
  for newer feature copy, including streaming-policy and some Persius labels.
- No native-speaker approval is claimed. Only the listed settings routes have
  matching visual comparison; affected media pages, dialogs, notifications,
  additional languages and regional formatting still require acceptance.
- No live provider account, production database or external message delivery was
  used. Tests run against isolated seeded runtime configs with offline guards.

Evidence and screenshots are retained under
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`,
including `localization-*-visual-review.jpg`, browser logs/traces, repair ledgers,
and `localization-english-baseline-candidate-diagnostics.json`. Pixel differences
are diagnostics, not automatic acceptance thresholds.
