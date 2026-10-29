# SeerrOrig / SeerrNGJ Theme Package Readiness

Updated 2026-10-29 against the local verification worktree for draft PR #416. The package implementation and all available local automated gates have been rechecked. This record separates those results from checks that require external infrastructure or live visual acceptance.

## Product and engine decision

- Keep the SeerrNG engine, backend, APIs, provider integrations, database, permission checks, migrations, and dependency contracts.
- Use Seerr `v3.5.1` (`564bfb08b54caa374bddaf820abfd226e5e69151`) as the visual and interaction reference for SeerrOrig only; do not roll the backend back to upstream Seerr.
- SeerrOrig restores the flatter upstream navigation, compact catalog cards, denser slate surfaces, and original detail-page flow. SeerrNGJ retains John's grouped navigation, larger cards, blue/silver surfaces, framed cards, and split detail layouts. Both themes use the same feature components and route/API semantics.

## Theme package architecture

- `src/styles/globals.css` owns resets, Tailwind foundations, palette infrastructure, shared interaction behavior, and structural component styles. Built-in theme tokens for geometry, spacing, poster sizing, compact cards, detail rows, controls, and menu surfaces live in the selected theme package.
- `src/styles/interfaceThemes/shared.css` maps semantic component roles to theme tokens. `themes/seerrOrig/` and `themes/seerrNGJ/` each ship a manifest and complete scoped stylesheet with their own colors, layout, navigation, discovery, card, detail, settings, table, and responsive rules.
- The theme provider activates only the selected stylesheet from the same-origin API after load and account preference resolution. `_document` starts with SeerrOrig before hydration. Theme selection remains independent of the palette and advanced-color controls.
- The comparison fixture embeds production shared CSS and both package stylesheets. JSDOM tests confirm source parity and distinct poster, filter, detail, settings, navigation, and token values. The fixture is not a live application render.

## Custom theme authoring and safety

- A package is a directory containing `manifest.json` and `theme.css`; `.seerrtheme` distributions are JSON data and are never extracted as archives.
- `docs/interface-themes/authoring.md`, `manifest.schema.json`, and `template/` document the API version, scoping, layout tokens, packaging workflow, and checksums.
- The `interface-theme` CLI supports validate, pack, install, explicit replace, and uninstall. Installs are staged before activation; built-ins cannot be overwritten or removed.
- Validation covers manifest versions and fields, CSS syntax and scope, escaped/comment-split resource functions, at-rules and keyframe namespaces, and package/file/count/nesting limits. Installed CSS is revalidated before serving. The stylesheet endpoint uses `nosniff` and `Cross-Origin-Resource-Policy: same-origin`.
- API v1 packages are CSS-only: no JavaScript, HTML, fonts, images, or external resources. CSS can still hide existing controls, which the authoring guide documents.

## Local verification completed

- Full Node suite: **3,760 passed, 5 skipped, 0 failed** (3,765 total) with `corepack pnpm@10.24.0 test:node --test-concurrency 4`. The skips are the live PostgreSQL request-status and migration execution tests.
- Full Vitest/CI suite: **632 files passed, 2 skipped; 4,475 tests passed, 5 skipped, 0 failed**. The skipped tests require PostgreSQL.
- Tooling suite: **307 passed, 12 skipped, 0 failed**. Local-only skips are PostgreSQL, Helm (not installed), and git release tags (not fetched); CI provisions these dependencies.
- TypeScript server/client checks, ESLint, Oxlint, repository Prettier check, `git diff --check`, bundle-size check, and current-batch contract check passed. Lint reported warnings only.
- UI shared-style check inspected **486/486 components**; focused UI geometry/style tests passed **73/73**.
- Next.js production build generated all **140 static pages**. The bundle check inspected **303 chunks (7.08 MB)**. The server build emitted both theme packages under `dist/interface-themes/`.
- Workflow boundary tests passed **11/11**. Focused theme package, provider, security, and route tests are included in the full suites.

## Remaining release gates

1. **Live PostgreSQL migrations:** execution remains unverified. The five PostgreSQL tests were skipped because no test URL/service is configured. PostgreSQL binaries are present, but this container blocks switching to the unprivileged UID required to start the server. The SQLite migration suite and PostgreSQL SQL contract tests pass; they do not replace a live PostgreSQL run.
2. **Rendered acceptance:** source-backed comparison tests prove the two package styles resolve differently, but live route review at desktop/mobile sizes, including keyboard, touch, loading, empty, and populated states, has not been completed.
3. **Repository CI:** the public-fork workflow produces no jobs for this same-repository branch. The project CI workflow is manual and requires a private JIT runner; no CI result exists for this candidate.

The implementation and local automated gates are complete. The change is **not fully release-ready** until live PostgreSQL execution, rendered acceptance, and the project CI run are completed. PR #416 remains draft and unmerged.
