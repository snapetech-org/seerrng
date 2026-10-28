# SeerrOrig / SeerrNGJ Rebuild Status

This is the working status record for the two-interface rebuild. Update it in
the same commit as each implementation slice. A source change is not visual
acceptance: rendered review stays unverified until the application has been
captured at matching viewports and states.

## Implementation basis

- Rebuild base: `snapetech-org/seerrng` `main`, commit
  `4f5541aa5d83cb95e2cbd214ebda72d025d5daf6`.
- Exact original UI reference: Seerr `v3.5.1`, commit
  `564bfb08b54caa374bddaf820abfd226e5e69151`.
- Engine/backend decision: keep the SeerrNG engine, APIs, provider integrations,
  database, and current dependency contracts. Upstream v3.5.1 is the visual and
  interaction reference for SeerrOrig, not a backend rollback target.

## Rebuilt in this slice

- Added the account-level `interfaceTheme` preference with the stable values
  `seerrOrig` and `seerrNGJ`; the default is `seerrOrig`.
- Added an own-profile API write route and SQLite/PostgreSQL migrations.
  Accounts with the explicit legacy `john-redesign` preset migrate to NGJ;
  other accounts use the new Orig default.
- Added a theme selector separate from the existing palette and advanced-color
  controls. `_document` starts on SeerrOrig before hydration; the authenticated
  account profile is restored as soon as user settings load.
- Added three independently owned stylesheets in
  `src/styles/interfaceThemes/`. Each has its own navigation, poster, detail,
  card, form, table, and surface rules.
- Expanded theme coverage to current video and cross-media detail roles,
  acquisition cards, issue/blocklist summaries, service settings, and data
  tables. The route components retain their existing behavior and contracts.
- Extracted theme-specific navigation presentation into a tested helper:
  SeerrOrig flattens and orders the original core links while retaining current
  visibility filtering; SeerrNGJ keeps the grouped SeerrNG navigation.
- Expanded the side-by-side static comparison harness with discovery, an
  audiobook detail, a request action, and service administration examples. It
  loads the same profile stylesheets used by the application.
- Added the initial route-family feature map and this implementation record.

## Verification status

- CSS coverage now reaches the shared contracts used by the listed route
  families; render acceptance is still needed to catch route-specific markup,
  responsive, and state regressions.
- Focused theme-provider tests, server/client type checks, translation checks,
  and lint have passed. The navigation presentation tests pass (2/2), client
  typecheck passes, and the changed navigation files pass Prettier. A SQLite
  migration execution test covers Orig defaults, the explicit John migration,
  idempotency, and rollback.
- The four-worker full Node run reported 3,754 passed, 5 skipped, and 2 failed
  out of 3,761. The provider deadline assertion missed its 6-second bound by
  51ms under suite load; it passes when isolated. The settings route test file
  was killed during that run; it passes in isolation (93/93). A two-worker full
  rerun was stopped before it produced a final summary, so a clean full-suite
  result remains open.
- PostgreSQL migration execution has not yet been performed. This workspace
  has no PostgreSQL client/server, container runtime, or configured database
  URL; repository CI uses a private, manually dispatched runner for
  database-backed checks.
- The full repository formatting check failed before formatting the changed
  sidebar file. All changed files now pass the focused Prettier check; the full
  repository check remains pending.
- The comparison page is a static fixture using the production profile
  stylesheets. Live route screenshots, keyboard/touch review, and matching
  viewport comparisons have not been completed; UI acceptance is
  **unverified**.
- A theme audit caught and corrected the poster-size inversion: SeerrOrig now
  uses the upstream 150px catalog track and SeerrNGJ uses the SeerrNG 169.2px
  track. Both profile grids read their width from the profile token, and the
  comparison page has been regenerated from those production stylesheets.
  `node --test src/styles/interfaceThemeProfiles.test.mjs` passes 3/3, including
  checks that the embedded CSS matches source and that the two computed layouts
  differ. Changed-file Prettier and `git diff --check` also pass.
- A serial full Node-suite rerun did not produce a final TAP summary after its
  execution session was lost during the `User persistence` tests. It is not a
  clean suite result; the existing full-suite gate remains open.

## Next gates

1. Complete a clean full Node suite run with a concurrency setting that fits
   the available memory; retain the exact pass, skip, and fail counts.
2. Execute the PostgreSQL migration path against a disposable PostgreSQL
   database.
3. Render both themes in the running app at matching desktop and phone
   viewports. Review Home, video and cross-media detail, request flow, and admin
   routes with loading, empty, and populated states.
4. Finish the route-level interaction and responsive review recorded in
   `feature-map.md`, then update the mockup and status from verified renders.
5. Keep each implementation slice committed and pushed to the draft PR; do not
   merge it.
