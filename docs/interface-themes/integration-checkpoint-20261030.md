# PersiusNG native integration checkpoint — 2026-10-30

Status: **incomplete; keep draft PR #424 unmerged**. This record supersedes any
interpretation of component-fixture evidence as production acceptance.

## Source and environment

The integration workspace was hydrated from
`b3b4fd29f879145551a6e857c5d0cb7757004d5d`: 3,338 source/resource blobs were
verified against the repository. Archived release notes and large README-cover
images were excluded. The existing partial checkout was preserved.

The exact lockfile installed 1,458 packages with pnpm 10.24.0. Node was 24.22.1;
the native better-sqlite3 binding was rebuilt successfully, reporting SQLite
3.53.4. Tests used the repository's native setup and actual database subscribers.

The execution environment became unavailable during the broader integration
checks. The changes in this checkpoint were replayed against that exact remote
head through GitHub and must be rerun in a restored workspace. They are not a
byte-for-byte archive of every transient local edit. In particular, the unfinished
pending-request retarget implementation was not published as verified code.

## Changes preserved

| Owner | Change |
| --- | --- |
| Native client composition | Correct contextual navigation typing, movie quality narrowing, error rendering, and advanced-request user policy typing. |
| Theme runtime | Permit presentation hooks outside a provider to retain classic composition; keep the strict application theme hook. ThemeProvider fixtures now model catalog GETs and stylesheet load completion. |
| Container package | Include the interface-theme CLI wrapper alongside its compiled command. |
| Book identity and status | Separate Open Library ISBN metadata editions from exact provider recordings, preserving legacy request/availability behavior. |
| Recording completion | Share the cancellation admission lock and save the full request entity so notification intents and status-history subscribers observe completion exactly once. |
| Edition destinations | Carry the selected server through hook, picker, API and OpenAPI schema; accept server ID zero; validate the configured format destination; use runtime service configuration, default preference, unambiguous work matching and destination-specific ownership. |
| Request selection | Reset recording choices on format changes and preserve saved provider choices/legacy ISBNs during edit initialization. |
| Classic book details | Restore the original overview section, Markdown normalization and safe link transform, scoped to the classic composition. |
| Build contracts | Retain every required server build step including theme assets; check theme-owned compact geometry; require the shared modal canvas in both conditional branches; allow only the explicitly approved Persius format label. |
| Regression harnesses | Use actual provider classes with instance/prototype transport boundaries under native setup, preserve badge assertions without attribute-order dependence, and resolve the SQLite child-process TypeScript entry explicitly. |
| Translations | Restore generated alphabetical ordering without changing English message values. |

The selected package remains served natively by SeerrNG. `src/proxy.ts` remains
authentication/redirect middleware. No external deployment configuration changed.

## Observed verification

- The last completed focused native run before environment loss passed **54
  tests in four files**: book-search completion/cancellation (19), edition
  lookup/ownership (6), Sonarr request preferences (7), and native TV request
  modal behavior (22).
- A broader run started while imports and compatibility fixes were still
  changing: 620 files passed, 18 failed and 2 skipped; 4,384 tests passed, 125
  failed and 5 skipped. This is diagnostic output from a moving source tree,
  **not a final result for this checkpoint**.
- The production build stopped in prebuild checks before Next/server compilation.
  Its findings included the missing classic overview and stale ownership/build
  contracts. The source corrections above have not had a native build rerun.
- The earlier 53-test isolated run and 27 component-fixture renders remain
  historical evidence for their earlier source. They do not validate this
  checkpoint or a signed-in production instance.
- After environment loss, source inspection, JSON/order checks and JavaScript
  syntax validation of the contract library were possible. Native TypeScript,
  formatting, test, production-build and browser execution were unavailable.

The 54-test result describes the earlier working state. Recovery changes,
including contract/fixture repairs and classic-overview restoration, were made
after that run and require verification on the final published revision.

## Remaining before production

1. Complete pending-book-request editing: preserve an exact recording's identity
   and format, revalidate it when the destination changes, and synchronize the
   persisted service targets with the edited server/profile/root/tags. Include
   permission, default/zero-ID destination, legacy ISBN and both-format regressions.
2. Run native tests on an unchanged final tree. Recheck ThemeProvider stylesheet
   loading, standalone season-tree consumers, book availability, request routes,
   notifications/history and the revised build-contract mutations.
3. Reproduce the HTTP/TLS loopback socket failures seen in the broader run before
   deciding whether they are harness/environment failures or production defects.
   Do not alter production transport based only on that incomplete run.
4. Run the repository's format, lint, server/client typechecks, tooling and Node
   suites, i18n/current-batch checks, and a complete production build. Verify
   container CLI and packaged-theme behavior from the built output.
5. Execute the PostgreSQL migration path against a disposable database; run
   Playwright/Cypress and signed-in route comparisons for all nine mockup flows,
   existing themes, loading/error states and responsive breakpoints.
6. Confirm provider round trips where required before retiring an external
   UI-rewriting proxy. No running deployment or pixel-for-pixel production match
   has been accepted.

No workflow was dispatched. Checkpoint commits use `[skip ci]`; private ephemeral
JIT runner policy remains unchanged. No merge or deployment was performed.

Confidence: **high** in the observed focused test result; **moderate** in the
recovered source changes; **unknown** for final production build and exact live
visual parity.
