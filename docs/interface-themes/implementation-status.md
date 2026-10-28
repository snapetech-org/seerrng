# SeerrOrig / SeerrNGJ Theme System Status

Updated 2026-10-28 from the GitHub `main` checkout plus the local verification pass. The theme package architecture is implemented and present on `main`. This record distinguishes code and automated checks from acceptance gates that still require live services or a rendered browser.

## Product and engine decision

- Keep the SeerrNG engine, APIs, provider integrations, database, permission checks, migrations, and dependency contracts.
- Use Seerr `v3.5.1`, commit `564bfb08b54caa374bddaf820abfd226e5e69151`, as SeerrOrig's visual and interaction reference; do not roll the backend back to upstream Seerr.
- SeerrNGJ preserves John's grouped navigation and blue/silver presentation. Both interfaces use the same feature components and route/API semantics.

## CSS ownership and runtime

- `src/styles/globals.css` supplies reset/Tailwind foundations, shared interaction behavior, palette infrastructure, and structural component styles. It no longer supplies the built-in theme values for the package-owned geometry, spacing, poster sizing, compact cards, detail rows, controls, or menu surfaces.
- `src/styles/interfaceThemes/shared.css` maps shared semantic roles to the `--interface-*` tokens. The theme packages own those token values and add scoped selectors for page, navigation, discovery, card, detail, settings, table, and responsive layouts.
- `themes/seerrOrig/` and `themes/seerrNGJ/` each contain a manifest and a complete scoped stylesheet. SeerrOrig uses compact 150px posters, flatter upstream-order navigation, tighter slate surfaces, and a centered-to-row detail flow. SeerrNGJ uses 169.2px posters, grouped navigation, framed navy/blue surfaces, and denser split layouts. The source CSS and comparison fixture are checked for distinct computed geometry and route arrangements.
- `_document` supplies SeerrOrig before hydration. The theme provider fetches the selected stylesheet from the same-origin API and activates it after it loads and the account preference saves. Only the selected package stylesheet is active.
- Theme selection remains independent of the color palette and advanced color controls. CSS can restyle and rearrange existing elements; markup, React, actions, routes, and permissions remain application-owned.

## Custom authoring and distribution

- A package is a directory with `manifest.json` and `theme.css`; the distributable `.seerrtheme` file is JSON data and is never extracted as an archive.
- `docs/interface-themes/authoring.md`, `manifest.schema.json`, and `template/` document the API version, theme-scoped selectors, supported layout tokens, package workflow, and release checksums.
- The `interface-theme` CLI validates, packs, installs, replaces, and uninstalls custom themes. Installations are staged before swapping into app data; replacement is explicit; built-ins cannot be overwritten or removed; restart rescans the catalog.
- The validator checks manifest fields and versions, CSS syntax and scope, CSS escapes and external-resource functions, at-rules and keyframe namespaces, and package/file/count/nesting limits. Custom CSS is revalidated before serving. The same-origin stylesheet response uses `nosniff` and `Cross-Origin-Resource-Policy: same-origin`.
- Packages contain CSS only. JavaScript, HTML, fonts, images, and external resources are not part of API v1. Scoped CSS can still hide controls, so the authoring guide tells users to inspect third-party source.

## Verification completed

- Theme CSS contract tests: **148 passed, 0 failed**, covering package-owned tokens, source/preview CSS equality, distinct computed layouts, navigation, card spacing, detail rows, controls, and global/shared ownership.
- Theme package, registry, API, provider, and navigation tests: **24 passed, 0 failed** in the focused server/client test run.
- Server and client TypeScript checks passed with repository-pinned pnpm 10.24.0.
- Server build passed and emitted the built-in theme packages and CLI.
- Next.js production build passed, including static generation of 140 pages.
- Changed-file ESLint, Oxlint, Prettier, and `git diff --check` passed. The full repository lint/format scripts were not used as substitutes for these targeted checks.
- `node bin/check-refreshed-ui-style.js` passed across 486 components.
- CLI integration passed in a temporary app-data directory: validate, pack, install, explicit replace, and uninstall.
- A regression test now checks that CSS comments cannot split external-resource function names to evade validation.
- `theme-comparison.html` embeds the production shared CSS and both theme package stylesheets; JSDOM verifies the embedded CSS matches source and resolves different poster, filter, detail, settings, navigation, and token values.

## Remaining readiness gates

1. **Full Node suite:** no clean final result yet. The latest two-worker run stopped producing output after roughly 34 minutes and was interrupted without a final TAP summary; captured output had no failure lines, which is not a pass. An earlier four-worker run reported 3,754 passed, 5 skipped, and 2 failed out of 3,761 (a provider deadline missed by 51ms under load and the settings-route worker being killed). Both affected groups passed in isolation, but the suite needs a complete stable run.
2. **PostgreSQL migrations:** the execution test is gated by `SEERR_MIGRATION_TEST_POSTGRES_URL`. This workspace has no PostgreSQL client/server, container runtime, or configured test URL, so live PostgreSQL execution remains unverified. SQLite migration tests do not replace it.
3. **Rendered acceptance:** live route screenshots and keyboard/touch/responsive review remain unverified. The static comparison is a source-backed fixture, not a live application review. The feature map covers route families as an audit plan; it does not claim all 149 page routes and states were rendered.

The per-theme CSS architecture and authoring workflow are implemented. The change is **not fully release-ready** until the full suite, PostgreSQL execution, and rendered acceptance gates above are closed.
