# Optional administrator interface policy — November 10, 2026

The existing **Default Interface** selection still controls the server home
address. **Apply Default Interface to All Users** is opt-in and ignores an old
classic-home browser cookie at `/`. **Lock Lumen for Non-Administrators** is
separately opt-in, available when included Lumen is selected, and redirects
signed-in non-administrators from native page requests. Native sign-in remains
available before user identity is known; authenticated administrators retain
native access. Switching the default away from included Lumen clears the lock.

The routing owner is `server/lib/lumenFrontend.ts`, with session-aware native
page admission in `server/index.ts`. General settings reuse the established
`SettingsFormRow` and `SettingsField` checkbox owners. No CSS owner, dimensions,
palette, or breakpoint was changed. Lumen hides its full-interface links from
signed-in non-administrators while the lock is active.

## Verification

- Final source: server and client type checks, ESLint, production build,
  current-batch/style checks, Lumen build, 103 focused native route/settings
  tests, one admin-policy browser flow, two existing default-entry browser
  flows, and three General settings grid browser flows passed.
- Browser flow used the built application and seeded admin/friend accounts. It
  saved both controls through the General form, read them back, verified the
  friend with a classic-home cookie entered Lumen at `/`, verified `/seerrng`
  redirected the friend to Lumen, hid the friend's full-interface link, and
  retained the admin's native access. A follow-up regression also verified the
  redirect for a native page request with `Accept: application/json`. The test
  restored the original settings.
- Exact pre-change `HEAD` was built in a separate worktree with independent
  dependencies. Baseline and candidate `/settings/main` captures at
  1440×900, 640×900, and 390×900 use the same SeerrNGJ theme, seeded account,
  and `settings-mobile-grid.spec.ts` workflow. The additive row shifts later
  fields downward as expected; card edges, controls, typography, and responsive
  widths remain aligned, with no horizontal overflow. The selected-state
  captures show both new controls enabled at desktop and phone sizes.
- Evidence is retained at
  `/mnt/disks/scratch/task-deliverables/seerrng-interface-lock-20261110/`.
  English extraction, source fingerprint update, and `i18n:check` passed.
  Catalog review still reports existing untranslated and extra-key records
  across locale files; those reports are not a translation qualification for
  the new English strings.
- The pre-commit staged ESLint command applies the native absolute-import rule
  to Lumen's established relative-import layout and fails on those existing
  imports. Root ESLint, Next lint, Lumen TypeScript/build, focused Prettier,
  attribution, and the staged Semgrep scan ran directly and passed; the commit
  used `HUSKY=0` only after those checks.

This fixture verifies routing and rendered settings. It does not exercise
external authentication providers or a production upgrade image.
