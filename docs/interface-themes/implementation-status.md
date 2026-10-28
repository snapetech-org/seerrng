# SeerrOrig / SeerrNGJ Rebuild Status

This is the working status record for the two-interface rebuild. Update it in
the same commit as each implementation slice. A source change is not visual
acceptance: rendered review stays unverified until the application has been
captured at matching viewports and states.

## Recovered source and baseline

- Rebuild base: `snapetech-org/seerrng` `main`, commit
  `4f5541aa5d83cb95e2cbd214ebda72d025d5daf6`.
- Exact original UI reference: Seerr `v3.5.1`, commit
  `564bfb08b54caa374bddaf820abfd226e5e69151`.
- The former implementation commit IDs and named output files were absent from
  the fresh checkout, its Git refs, and the persistent file catalog. The
  conversation screenshot confirms the old output panel listed
  `theme-comparison.html`, `implementation-status.md`, `feature-map.md`,
  `seerrOrig.css`, `seerrNGJ.css`, and `shared.css`; it does not expose their
  source contents. The names and design intent are being reconstructed here.
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
  `src/styles/interfaceThemes/`. They already establish different navigation,
  poster size and shape, detail-page arrangement, card surfaces, and colors.
- Rebuilt a side-by-side static comparison harness in `theme-comparison.html`
  using the actual profile stylesheets and current semantic component roles.
- Added the initial route-family feature map and this implementation record.

## Not yet accepted

- The sheets currently cover the shared shell, browsing posters, and video
  detail composition. They do not yet prove full route-family coverage for the
  cross-media catalogs, request and admin screens, user profiles, or less common
  settings panels.
- Focused theme-provider tests, server/client type checks, translation checks,
  and lint have passed. The full Node suite is running at the CI-configured
  four-worker limit; its result is still pending. A SQLite migration execution
  test now covers Orig defaults, the explicit John migration, idempotency, and
  rollback.
- PostgreSQL migration execution has not yet been performed. This workspace
  has no PostgreSQL client/server or configured test URL; repository CI uses a
  private, manually dispatched runner for database-backed checks.
- The full repository formatting check failed before formatting the changed
  sidebar file. All changed files now pass the focused Prettier check; the full
  repository check remains pending.
- Browser rendering, keyboard/touch review, and matching viewport comparisons
  have not yet been completed. UI acceptance is **unverified**.
- No claim is made that the rebuilt preview has already passed screenshot
  comparison with upstream v3.5.1.

## Next gates

1. Complete a role/route audit for every page family in `feature-map.md`; extend
   reusable theme owners where a route is still relying on undocumented
   utility-class geometry.
2. Finish the full Node, Vitest, tooling, type, format, lint, and build checks;
   record exact counts and any infrastructure blocker.
3. Execute both migration paths from disposable SQLite and PostgreSQL databases.
4. Render both designs from the running application, at equal desktop and phone
   viewports. Compare Home, a video detail page, one cross-media detail page, a
   request flow, and an admin page, including loading, empty, and populated
   states where applicable.
5. Update the comparison page and this record from verified screenshots. Keep
   every implementation slice committed and pushed to the draft PR; do not
   merge it.
