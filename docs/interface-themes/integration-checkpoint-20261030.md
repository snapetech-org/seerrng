# PersiusNG native integration checkpoint — 2026-10-30/31

Status: **native code integration implemented and locally verified; draft PR
#424 remains unmerged for release-environment checks**. This record replaces the
interrupted-checkout status. It does not claim live provider acquisition or a
pixel-identical match of changing catalog content.

## Native implementation

| Area | Integrated behavior |
| --- | --- |
| Theme runtime | Built-in PersiusNG and separately named community packages load from SeerrNG's same-origin catalog/CSS API. The account preference persists through the real own-profile route. Production OpenAPI validation admits these routes. A superseded selection cannot strand a loaded stylesheet off-document. |
| Reference composition | Native Discover, movie/series catalogs, movie detail, ebooks, audiobooks, recording selection, current Requests, coming-soon calendar and season dialog use the Persius composition and independently owned CSS. Caption geometry, dialog surfaces, mobile chrome, request actions, detail search alignment, overflow and keyboard dismissal were reviewed in the production app. |
| Current Requests route | `components/Requests` uses native status snapshots, polling, owner-scoped Active/Ready/All tabs, progress, retries, cancellation and download actions. Detailed management/history remains reachable. Explicit All and All Users filters survive query restoration. Classic themes retain their existing rendering. |
| Recording identity | Provider work/edition identity, selected format and alongside policy survive the native request flow. Legacy Open Library ISBN IDs keep their original semantics. Edition lookup verifies exact ownership at the selected configured destination, including server ID zero. |
| Pending recording edits | Exact recording identity/format are immutable. Retargeting revalidates the destination edition and capability, then updates request and service targets together. Zero IDs, empty tags, both-format legacy behavior, permissions and failed-edit rollback are covered. |
| Recording completion | Completion shares the cancellation admission lock and saves the full entity, preserving notification intents and status-history subscribers. Another recording's work-level availability cannot complete the request. |
| Future seasons | Nullable SQLite/PostgreSQL preference, validation and Sonarr v3/v5 adapters preserve legacy defaults. Episode Queue and watch gates retain priority; opting out does not unmonitor another existing request. |
| Community authoring | Create, validate, inspect, pack, install, replace, list and uninstall work with independent CSS, manifest composition/navigation choices, reproducible bundles and checksum sidecars. The packaged CLI works without TypeScript source. Guides, template/schema, submission form and release notes are included. |
| Browser harness | Signed-in production routes use deterministic catalog/read fixtures. Optional offline server checks reject external HTTP/fetch/socket destinations before environment-proxy translation. Browser fixtures reject unhandled external traffic. The disposable media-server fixture uses loopback. |

`src/proxy.ts` is still authentication/redirect middleware. A separate
UI-rewriting proxy is not a runtime dependency. No running deployment or external
proxy configuration was changed.

## Verification

The restored checkout uses Node 24.22.1 and the exact pnpm 10.24.0 lockfile (1,458
packages), with native better-sqlite3/SQLite 3.53.4. Database tests use the normal
repository setup and real subscribers. The final production build includes both
the server and all 141 statically generated Next.js pages.

| Check | Observed result |
| --- | --- |
| Full native Vitest suite | 640 files passed, two skipped; **4,525 tests passed, five skipped**, zero failures. |
| Focused post-review checks | 36 tests passed in six files, including native OpenAPI/theme contracts and request entry; a subsequent 36-test/four-file season and dialog run also passed. These runs overlap and are not an additional unique-test total. |
| Native Node runner | Full rerun in progress after the reporter fix; the prior truncated invocation is not counted as a pass. Focused runner checks: two passed. |
| Tooling | **325 passed, four skipped**, zero failures; includes theme CLI round trips, the offline boundary and native PostgreSQL opt-in gate. |
| Current-batch / UI style | Passed; 73 geometry/role tests passed. |
| Formatting / lint / types / translations | Server/client type checks, lint (warnings only) and translation/prebuild checks passed. Whole-repository formatting passed, including the new browser harness; generated browser output is excluded consistently with Git. |
| Production build | Passed server and Next.js production build with the normal prebuild checks. |
| Signed-in browser suite | **20 passed**, zero failures, skips or flaky results. Includes 27 route/viewport captures and document-overflow checks, plus ordinary-user season dialogs, classic themes and an installed derivative. |
| Classic theme comparisons | **20 matched baseline/candidate captures**, across SeerrOrig/SeerrNGJ, five route families and two widths. 18 have identical pixels; two show text/gradient rasterization variation, with no observed layout regression. Raw differences are recorded in the report. |
| Compiled theme package smoke | Create, validate, pack/checksum, install, inspect, list and uninstall passed from a staged runtime without server TypeScript sources. A separately installed derivative also passes native catalog/picker/persistence browser checks. |

The complete native suite runs on an unchanged application tree. The subsequent
small visual and fallback changes are covered by the focused checks, final
production build and browser suite. HTTP/TLS regressions were traced to test
transport using the host proxy; tests now own a direct dispatcher. Production
transport was not altered to accommodate the test environment.

The initial native Node invocation exited without a complete report and is not
counted as a pass. A high-volume reproduction showed that forced worker exit can
drop buffered results. The runner now permits natural completion, checks for a
root summary and preserves nonzero failure status. Its failure-exit and complete
1,600-result/two-destination regression tests pass in both native Node and Vitest.
The native Node result above refers to the subsequent invocation.

Screenshot capture now requires two identical frames after route/font/image
readiness. The final classic comparison contains 74,291 changed pixels, of which
74,275 differ by one channel level; only three exceed an eight-level channel
difference. The differences are in one phone Requests capture and the settings
sidebar gradient. They are recorded rather than masked or called exact matches.

The [native browser report](evidence/persiusng-native-verification.json),
[desktop sheet](evidence/persiusng-native-desktop.jpg) and
[phone sheet](evidence/persiusng-native-phone.jpg) record the reference routes,
viewports, scope and comparison outcomes. The classic baseline is
`8a72b6db85e63b7560f5498194b22d33034d5d38`; the candidate is this commit's
application source. Earlier component-only evidence remains historical.

## Release-environment checks

1. **Native PostgreSQL execution.** SQLite round trips and PostgreSQL SQL/adapter
   contracts are covered. The opt-in theme/future-season migration test checks
   existing values, null/true/false, repeat up/down and rollback with TypeORM.
   It needs `SEERR_MIGRATION_TEST_POSTGRES_URL` pointing to a disposable database.
   This environment cannot run PostgreSQL as its available root-only identity.
   The native PostgreSQL tests remain explicit skips, not passes.
2. **Cypress runner.** Verification found no installed Cypress executable. The
   installation attempt returned a truncated/non-ZIP download. The production
   route checks ran in Playwright/Chromium; the separate Cypress suite was not
   executed. Run it on the project's private ephemeral JIT environment with its
   browser dependencies before release.
3. **Live providers and original artwork.** Browser catalog/provider reads are
   deterministic fixtures. Native tests exercise adapter payloads and real local
   persistence, not live Sonarr/Bookshelf acquisition or external playback.
   Test artwork is low-resolution contact-sheet material, not runtime assets.
   Confirm provider round trips and compare original-resolution artwork on the
   intended deployment before retiring its old UI proxy. Real titles, counts,
   metadata, permissions and additional management controls remain data-driven.

Initial compatibility attempts were stopped by automatic approval review
because the seeded Plex account could contact a private or external destination.
The completed browser runs use local accounts without linked provider credentials,
loopback configuration and the offline boundaries described above. No real media
provider credential was used for these acceptance checks.

No CI workflow was dispatched. Commits carry `[skip ci]`, and the private
ephemeral JIT runner policy is preserved. No merge or deployment was performed.

Confidence: **high** in native code integration, the observed checks and the
bounded rendered comparisons; **moderate** in exact live visual parity until the
original artwork/provider deployment checks above are performed.
