# PostgreSQL Startup Recovery — Issue #164

## Recovery identity

- Base: `a9dd1b5a64cd9ccabe59da198b0524a7886bb708` (`origin/main`).
- Issue fix commit: `0980bc5d1db052f566cd97b46b98a89149a34952`.
- Supporting packaging-fixture test commit: `e87fef1e4374eadf0b3e15667eb57f44ccc5a6ff`.
- Upstream issue: https://github.com/snapetech-org/seerrng/issues/164.
- Pre-audit recovery archive: `/tmp/seerrng-issue164-preaudit-20261006.tar`.

## Root cause and changes

Three `@UpdateDateColumn` decorators passed SQLite's `datetime` type directly
to TypeORM. PostgreSQL rejects that type while building entity metadata, before
startup reaches the migration runner. The affected columns are
`ReaderDeliveryGrouping.updatedAt`, `GameLibraryAccount.updatedAt`, and
`GameLibraryEntry.updatedAt`.

The fix resolves those types for the active database and adds a reversible
PostgreSQL migration to normalize nine private-library date columns, preserving
their wall-clock values under the session timezone. The issue commit includes a
metadata regression test, migration test, and release-note fragment.

## Verification

- Before rebasing, full Linux `pnpm test:ci`: 487 files passed, 1 skipped; 3,375 tests passed,
  4 skipped; 0 failures. The four skips were PostgreSQL-gated tests.
- Before rebasing, focused PostgreSQL 18 Node run: 5 passed, 0 failed, 0 skipped. This included
  all four database-gated migration tests and the issue migration query test.
- Focused Linux Vitest metadata regression: 1 passed.
- The PostgreSQL metadata test now also records the original failure mode:
  TypeORM rejects `datetime` for `ReaderDeliveryGrouping.updatedAt` while
  building PostgreSQL metadata. The current database-aware column type builds
  successfully.
- After adding that negative regression case, the focused metadata suite passed
  2/2 locally; the PostgreSQL timestamp migration query and two SQLite library
  migration tests passed 3/3.
- On the rebased candidate, the PostgreSQL entity-metadata regression passed
  (1/1), and the PostgreSQL timestamp migration plus SQLite library migration
  tests passed (3/3) with a workspace-local temporary directory.
- Disposable PostgreSQL 18 migration round-trip (before rebase, same issue
  commit contents): all nine columns converted up and down, preserving values
  under an `America/Edmonton` session timezone.
- Before rebasing, Linux `pnpm build`: passed. Translation extraction, 569-file current-batch
  contract, shared-style checks, 68 button/geometry tests, server compilation,
  Next.js compilation, and all 113 static pages completed.
- Release-note preview rendered the PostgreSQL startup fix note.
- Before rebasing, `pnpm validate:development` on Linux ARM64 passed formatting, lint, types,
  Vitest (100 files; 453 tests), native TypeScript (2,912 passed, 4 skipped),
  and native JavaScript (485 tests). It failed one tooling test because its
  archive fixture assumed x64. The corrected fixture now passes 7/7 locally;
  the full gate was not rerun after that test-only correction.
- A full `pnpm test:node` attempt was stopped after 9m15s while compiling an
  unrelated Jellyfin suite. No failure was reported; that full lane is not
  counted as passed. Focused relevant Node tests passed separately.
- On the rebased candidate, `pnpm validate:development` on macOS 27 ARM64
  passed translation and shared-style checks, formatting, lint, server and
  client type checks, Vitest (104 files; 470 tests), and the native TypeScript
  and JavaScript lanes. It stopped in platform-aware tooling because several
  existing shell tests require Linux tools or Bash 5 behavior (`python`, GNU
  `base64`, `find -printf`, `stat -c`, and `mapfile`). A focused tooling rerun
  confirmed those host-tool differences; Ubuntu CI is the acceptance run for
  this lane.
- Main Cypress CI on `cee6572f` and `cde107d0` each ran 43 specs (185 tests):
  152 passed, 1 failed, and 32 were pending. The failure was caused by the
  catch-all settings mock returning `[]` for unrelated settings APIs whose
  responses are objects, including download-client settings. Those malformed
  fixtures caused client-side `TypeError`s when settings components accessed
  missing array fields, replacing the service page with Next.js's error page
  before `#prowlarr` could be found. The test now supplies the download-client
  object and passes other settings APIs through to their real handlers. The
  focused spec passed 1/1; the full local Cypress run passed 43 specs (153
  passed, 32 pending, 0 failed).
- The main image scan flagged the published production versions of `sharp`,
  `source-map-js`, and `proxy-addr`. The dependency pins and lockfile now use
  their patched releases. `pnpm audit --prod` reports no known vulnerabilities;
  the next main-branch Trivy scan must pass to verify the built image.
- No live database, account, or provider was used.

## Release

Before publication, the latest published tag was `v3.52.1`. The repository's
`Create tag` workflow determines the next version from unreleased conventional
commits on `main`.
