# Creating and Sharing SeerrNG Interface Themes

SeerrNG themes are small, versioned packages that own their visual CSS and a
few presentation choices such as navigation grouping and native page composition. The application keeps
the page markup, APIs, permissions, and actions. A theme package can restyle and
rearrange existing interface roles; it cannot add executable code or replace
application routes.

## Package contents

A source theme is one directory with exactly the two files the packer reads:

```text
my-theme/
  manifest.json
  theme.css
```

The quickest start uses a complete native theme and rebases every CSS selector:

```sh
pnpm install
pnpm interface-theme:create my-cinema --from persiusNG --name "My Cinema" --author "Your name"
```

This creates `my-cinema/manifest.json`, `my-cinema/theme.css` and a short README.
No server build, running application, proxy, GitHub fork or account is required
for creation and packaging. The command refuses to overwrite an existing folder.
Use `--from seerrOrig` or `--from seerrNGJ` for those starting points, or an
installed custom theme ID. An optional second argument chooses the output folder.
The new package has its own ID and full stylesheet; it does not load or inherit
the original package at runtime.

For a small hand-written example, copy [`template/`](template/) instead. Use a lowercase kebab-case ID such as
`my-theme`; IDs are permanent package identifiers and cannot be changed after
users save them in their account settings.

`manifest.json` declares the package identity, API versions, author, license,
and app-level presentation choices. `theme.css` is ordinary CSS attached
only while that theme is selected. Use the existing shared classes and
`data-interface-role` hooks to restyle the application's current controls and
route families.
The strict manifest contract is published in
[`manifest.schema.json`](manifest.schema.json); the runtime validator also
checks CSS syntax, selector scope, resources, and package size.

```json
{
  "formatVersion": 1,
  "themeApiVersion": 1,
  "id": "my-theme",
  "name": "My Theme",
  "description": "A short description shown in the theme picker.",
  "version": "1.0.0",
  "author": "Your name",
  "license": "MIT",
  "navigation": "grouped",
  "activeNavigationIcon": "outline",
  "layout": "persius"
}
```

`navigation` is `flat` or `grouped`. `flat` puts the currently visible links
into one ordered list using the SeerrOrig core order; `grouped` preserves the
current grouped route model. Permission and service-availability filtering
remain attached to the links. `activeNavigationIcon` chooses the existing
outline or filled icon for the active route.

The installed catalog exposes the theme name and those supported navigation
choices. CSS is loaded only for the selected theme. Publishing a changed
manifest or stylesheet uses a new package version; changing the ID creates a
separate theme and does not replace saved account settings.

## Choose a native composition

| Manifest `layout`    | Application markup available to your stylesheet                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Omitted or `classic` | Existing Seerr/SeerrNG catalog, detail, request and filter composition                                                                             |
| `persius`            | Cinematic discovery, captions below posters, book/narrator shelves, recording choices, compact requests, coming-soon releases and season shortcuts |

The layout is app-owned, not a script shipped by an author. Your theme ID can be
anything valid: Persius layouts are activated by this metadata, not the reserved
`persiusNG` name. Forking PersiusNG carries the metadata automatically. Forking
SeerrOrig or SeerrNGJ preserves the classic composition. The CSS remains fully
independent in either case. Navigation and icons are also native application
choices. Persius composition supplies its grouped outline navigation; the
`navigation` and `activeNavigationIcon` preferences govern classic compositions.
Do not attempt to inject executable components into a package.

Persius composition requires a SeerrNG release that includes PersiusNG in its
picker. Older releases reject the unrecognized metadata rather than silently
promising an equivalent layout. Publish the exact SeerrNG releases you tested.
Existing version 1 themes without `layout` remain supported unchanged.

## Make the stylesheet your own

Edit `theme.css` to change colors, typography, radius, density, shadows, grid/flex
arrangement and responsive behavior. Change the root variables first, then
change the scoped component rules. For example:

```css
:root[data-interface-theme='my-cinema'] {
  --interface-page: #101b1a;
  --interface-panel: #192d2a;
  --interface-accent-a: #91d6a6;
  --interface-card-radius: 6px;
}

[data-interface-theme='my-cinema'] .persius-request {
  border-radius: var(--interface-card-radius);
  border-inline-start: 3px solid var(--interface-accent-a);
}

:root[data-interface-theme='my-cinema'][data-theme-mode='light'] {
  --interface-page: #f5f7f0;
  --interface-panel: #ffffff;
  --interface-text: #172a23;
  --interface-muted: #4b6258;
}
```

Keep `my-cinema` consistent in every selector. The generator already replaces
the base ID, including namespaced animation names. Classes such as
`.persius-request` are shared application hooks and should keep their names.
They do not make a custom theme depend on the PersiusNG stylesheet. For the full
supported surfaces and route families, use the [feature map](feature-map.md).

Do not hide request, permission, availability, error or keyboard-focus states to
make a mockup look cleaner. Use the existing responsive rules as a starting point,
check long translated titles, and retain `prefers-reduced-motion` behavior.

## CSS ownership and scope

Every rule selector must begin with the package's theme root. For `my-theme`,
write selectors such as:

```css
:root[data-interface-theme='my-theme'] {
  --interface-page-gutter: 1.25rem;
  --interface-card-radius: 0.25rem;
}

[data-interface-theme='my-theme'] .sidebar {
  width: 17rem;
  border-radius: 0;
}

@media (max-width: 640px) {
  [data-interface-theme='my-theme'] .settings-page-content {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

The scope applies to all selector alternatives. A selector group with even one
unscoped selector is rejected. Package-owned properties include colors,
surfaces, typography, page/card layout, corner shapes, spacing, poster sizes,
and responsive rules. Shared app CSS continues to own resets, accessibility
baselines, common component behavior, and palette infrastructure. The existing
color-palette and advanced-color preferences remain independent of the
interface theme.

Built-in and custom packages can set these design-token families on their
theme root. Shared component roles resolve them to long-lived `--interface-*`
tokens, so components keep semantic contracts while each package changes its
effective appearance:

| Family                   | Package tokens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Controls                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Canvas and surfaces      | `--interface-page`, `--interface-panel`, `--interface-panel-raised`, `--interface-border`, `--interface-muted`, `--interface-text`, `--interface-link`, `--interface-accent-a`, `--interface-accent-b`, `--interface-sidebar-top`, `--interface-sidebar-bottom`, `--interface-sidebar-selected`, `--interface-table-header`, `--interface-table-hover`                                                                                                                                                                             | Backgrounds, copy, links, selected navigation, and table surfaces          |
| Main geometry            | `--interface-sidebar-width`, `--interface-page-gutter`, `--interface-grid-gap`, `--interface-card-radius`, `--interface-poster-radius`, `--interface-control-radius`, `--interface-main-card-padding`, `--interface-inset-card-padding`, `--interface-section-gap`, `--poster-width`, `--poster-aspect-ratio`                                                                                                                                                                                                                      | Navigation width, page columns, shelves, cards, controls, and poster grids |
| Navigation               | `--interface-nav-group-gap`, `--interface-nav-item-gap`, `--interface-nav-inline-inset`, `--interface-nav-nested-indent`, `--interface-nav-mobile-offset`, `--interface-nav-desktop-offset`, `--interface-nav-heading-line-height`                                                                                                                                                                                                                                                                                                 | Grouped navigation rhythm and nested/mobile alignment                      |
| Typography               | `--interface-card-table-font-size`, `--interface-card-table-heading-weight`, `--interface-card-table-value-weight`, `--interface-card-title-font-size`, `--interface-page-heading-font-size`, `--interface-card-subheading-font-size`, `--interface-card-body-font-size`, `--interface-card-copy-line-height`                                                                                                                                                                                                                      | Page, card, and metadata hierarchy                                         |
| Detail and compact cards | `--interface-detail-row-height`, `--interface-detail-row-gap`, `--interface-detail-divider-width`, `--interface-detail-first-column-limit`, `--interface-detail-first-value-limit`, `--interface-detail-last-column-limit`, `--interface-card-compact-title-font-size`, `--interface-card-compact-subheading-font-size`, `--interface-card-compact-line-height`, `--interface-card-compact-height`, `--interface-card-compact-padding-block`, `--interface-card-subheading-spacing-before`, `--interface-card-body-spacing-before` | Metadata tables, disclosure cards, and compact portrait rows               |
| Controls and menus       | `--interface-compact-control-height`, `--interface-profile-menu-row-height`, `--interface-button-padding-x`, `--interface-button-content-gap`, `--interface-poster-control-gap`, `--interface-dropdown-menu-surface`, `--interface-dropdown-menu-border`                                                                                                                                                                                                                                                                           | Buttons, compact controls, poster badges, and menus                        |
| Effects and framing      | `--interface-motion-duration`, `--app-card-frame-width`, `--app-card-frame-background`                                                                                                                                                                                                                                                                                                                                                                                                                                             | Motion timing and card edge treatments                                     |

The tokens are supported design knobs, not a limit on package CSS. A theme may
override any existing class or `data-interface-role` selector inside its exact
scope, including grid/flex ordering, responsive layout, control shape, shadows,
and component surfaces. Keep behavior and accessibility in shared role
contracts; put design values on the theme root so changes remain easy to audit.

Themes can rearrange existing components with CSS Grid, Flexbox, `order`, and
the app's semantic role hooks. Themes do not ship HTML, React components, route
definitions, event handlers, icons, fonts, or images. That keeps a theme
portable across users without giving it a code execution surface.

## Security and compatibility rules

Theme packages are data. SeerrNG parses and validates them before installation
and again before serving their stylesheets. The installer accepts one JSON
`.seerrtheme` file; it does not extract archives or follow package paths.

- CSS must parse, stay within 512 KiB, contain no more than 5,000 rules or
  20,000 declarations, keep selectors at 2,048 characters or less, stay within
  16 nested rule levels, and scope every rule to its exact theme ID.
- `@media`, `@supports`, and `@container` are supported. Keyframe names must
  start with the theme ID followed by a hyphen.
- `@import`, `@font-face`, global at-rules, CSS escapes, URL/image loading,
  `image-set()`, `paint()`, and legacy executable CSS values are rejected.
- JavaScript, HTML, external assets, and arbitrary package files are not part
  of format version 1.
- Package IDs and manifest fields are validated. Unknown manifest fields and
  unknown format/API versions are rejected. The install catalog accepts at most
  16 custom themes and 4 MiB of custom theme CSS total.
- Only installed packages are listed or served. The selected package's CSS is
  fetched from the same-origin API; unselected theme packages are not loaded.

Install themes only from authors you trust. Scoped CSS cannot access account
data through an application API, but a theme can still change or hide interface
elements and can make the UI difficult to use. Review the CSS before installing
community packages.

## Validate, package, install, and remove

From the SeerrNG checkout, run:

```sh
pnpm interface-theme:validate ./my-theme
pnpm interface-theme:pack ./my-theme
pnpm interface-theme:validate ./my-theme-0.1.0.seerrtheme
pnpm interface-theme:inspect ./my-theme-0.1.0.seerrtheme
```

Checkout commands use the existing development loader and run without compiling
the application. `pack` defaults to `<id>-<version>.seerrtheme` and also writes
`<id>-<version>.seerrtheme.sha256`. An optional output argument changes the name.
Both outputs are protected against overwrites; unchanged inputs produce identical
bundle bytes. `validate` accepts source directories and packaged files. `inspect`
prints metadata, composition, CSS size and SHA-256; `list` prints installed themes.

Production builds place the Node-only CLI in `dist/commands/interfaceTheme.js`.
The same operations work from a packaged SeerrNG host with Node available; for
example, `node dist/commands/interfaceTheme.js validate ./my-theme` runs the
validator directly when that host does not use pnpm.

Copy the resulting `.seerrtheme` file to the SeerrNG host and install it with
the same release's CLI:

```sh
pnpm interface-theme:install ./my-theme-0.1.0.seerrtheme
```

If the ID is already installed, installation stops. Updating an existing
custom theme requires the explicit `--replace` option:

```sh
pnpm interface-theme:install ./my-theme-0.1.0.seerrtheme --replace
```

The installer validates the full package before writing, stages both files in
the configured app-data theme directory, and swaps the directory only after
the staged package is ready. Restart SeerrNG to rescan installed themes. Users
can then select it from the interface design picker; the choice is saved to
their account. To remove a custom theme, first choose a different theme for
accounts using it, then run:

```sh
pnpm interface-theme:uninstall my-theme
```

The built-in SeerrOrig, SeerrNGJ and PersiusNG packages cannot be replaced or removed.
Installed packages remain in the app-data directory through application
upgrades. Keep the source files and packaged `.seerrtheme` together when
publishing so users can review, validate, and reproduce a release.

For a community release, publish the source directory, the `.seerrtheme`, the
SeerrNG version/API range, and a checksum together. For example:

```sh
sha256sum --check my-theme-0.1.0.seerrtheme.sha256
```

Users should validate the package and compare its checksum against the author's
release before installing it.

## Test and install without a UI proxy

1. Run the normal SeerrNG application directly. Install the package using that
   release’s CLI as the application user, with the same `CONFIG_DIRECTORY`.
2. Restart SeerrNG so its catalog discovers the package. Open **Theme picker →
   Interface design** and select your theme. Refresh the page and verify your
   account choice is restored.
3. Confirm the browser loads `/api/v1/interface-themes/<id>/theme.css` from
   SeerrNG itself. No stylesheet injector, userscript or UI-rewriting proxy is
   involved. Standard HTTPS/reverse-proxy hosting and Next.js authentication
   middleware are separate and should remain configured as needed.
4. Review Discover, movies, series, books, audiobooks, details, requests, calendar,
   settings and login at desktop and phone widths. Exercise request/cancel,
   filtering, format changes, narration and season selection, keyboard focus,
   loading/errors and authorized/unauthorized states. Also check light mode.
5. To revise an installed theme, increment its version, validate and pack it,
   install the new bundle with `--replace`, restart and reload. The stable ID
   preserves each user’s selection. Keep a previously validated bundle for rollback.

Browser developer tools can experiment with CSS on the direct app; copy changes
back into the source stylesheet before packaging. The maintainer-only
`interface-theme:preview` command updates the legacy comparison document; it is
not a substitute for live testing of a community package.

The [submission guide](submitting.md) gives a release checklist, supported review
routes and a ready-made GitHub form. [PersiusNG’s verification record](persiusng.md)
separates component evidence from the production acceptance that remains open.

## Versioning

Increment the package's semantic `version` for each release that changes its
CSS or presentation metadata. `formatVersion` identifies the package file
shape; `themeApiVersion` identifies the application roles and metadata
contract. Version 1 packages are CSS-only and target API version 1. A future
breaking contract will increment the API version and remain explicit in the
validator rather than silently guessing how to load older packages.

When a package targets SeerrNG features, declare the SeerrNG release range in
its distribution notes. The package is not allowed to declare or execute its
own compatibility script.
