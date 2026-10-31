# Creating and Sharing SeerrNG Interface Themes

SeerrNG themes are small, versioned packages that own their visual CSS and a
few presentation choices such as navigation grouping. The application keeps
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

Copy the [`template/` directory](https://github.com/snapetech-org/seerrng/tree/main/docs/interface-themes/template)
to start. Use a lowercase kebab-case ID such as `my-theme`; IDs are permanent
package identifiers and cannot be changed after users save them in their
account settings.

`manifest.json` declares the package identity, API versions, author, license,
and two app-level presentation choices. `theme.css` is ordinary CSS attached
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
  "activeNavigationIcon": "filled"
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

| Family | Package tokens | Controls |
| --- | --- | --- |
| Canvas and surfaces | `--interface-page`, `--interface-panel`, `--interface-panel-raised`, `--interface-border`, `--interface-muted`, `--interface-text`, `--interface-link`, `--interface-accent-a`, `--interface-accent-b`, `--interface-sidebar-top`, `--interface-sidebar-bottom`, `--interface-sidebar-selected`, `--interface-table-header`, `--interface-table-hover` | Backgrounds, copy, links, selected navigation, and table surfaces |
| Main geometry | `--interface-sidebar-width`, `--interface-page-gutter`, `--interface-grid-gap`, `--interface-card-radius`, `--interface-poster-radius`, `--interface-control-radius`, `--interface-main-card-padding`, `--interface-inset-card-padding`, `--interface-section-gap`, `--poster-width`, `--poster-aspect-ratio` | Navigation width, page columns, shelves, cards, controls, and poster grids |
| Navigation | `--interface-nav-group-gap`, `--interface-nav-item-gap`, `--interface-nav-inline-inset`, `--interface-nav-nested-indent`, `--interface-nav-mobile-offset`, `--interface-nav-desktop-offset`, `--interface-nav-heading-line-height` | Grouped navigation rhythm and nested/mobile alignment |
| Typography | `--interface-card-table-font-size`, `--interface-card-table-heading-weight`, `--interface-card-table-value-weight`, `--interface-card-title-font-size`, `--interface-page-heading-font-size`, `--interface-card-subheading-font-size`, `--interface-card-body-font-size`, `--interface-card-copy-line-height` | Page, card, and metadata hierarchy |
| Detail and compact cards | `--interface-detail-row-height`, `--interface-detail-row-gap`, `--interface-detail-divider-width`, `--interface-detail-first-column-limit`, `--interface-detail-first-value-limit`, `--interface-detail-last-column-limit`, `--interface-card-compact-title-font-size`, `--interface-card-compact-subheading-font-size`, `--interface-card-compact-line-height`, `--interface-card-compact-height`, `--interface-card-compact-padding-block`, `--interface-card-subheading-spacing-before`, `--interface-card-body-spacing-before` | Metadata tables, disclosure cards, and compact portrait rows |
| Controls and menus | `--interface-compact-control-height`, `--interface-profile-menu-row-height`, `--interface-button-padding-x`, `--interface-button-content-gap`, `--interface-poster-control-gap`, `--interface-dropdown-menu-surface`, `--interface-dropdown-menu-border` | Buttons, compact controls, poster badges, and menus |
| Effects and framing | `--interface-motion-duration`, `--app-card-frame-width`, `--app-card-frame-background` | Motion timing and card edge treatments |

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
pnpm build:server
pnpm interface-theme:validate ./my-theme
pnpm interface-theme:pack ./my-theme ./my-theme.seerrtheme
```

The build places the Node-only theme CLI in `dist/commands/interfaceTheme.js`.
The same commands work from a packaged SeerrNG host with Node available; for
example, `node dist/commands/interfaceTheme.js validate ./my-theme` runs the
validator directly when that host does not use pnpm.

Copy the resulting `.seerrtheme` file to the SeerrNG host and install it with
the same release's CLI:

```sh
pnpm interface-theme:install ./my-theme.seerrtheme
```

If the ID is already installed, installation stops. Updating an existing
custom theme requires the explicit `--replace` option:

```sh
pnpm interface-theme:install ./my-theme.seerrtheme --replace
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

The built-in SeerrOrig and SeerrNGJ packages cannot be replaced or removed.
Installed packages remain in the app-data directory through application
upgrades. Keep the source files and packaged `.seerrtheme` together when
publishing so users can review, validate, and reproduce a release.

For a community release, publish the source directory, the `.seerrtheme`, the
SeerrNG version/API range, and a checksum together. For example:

```sh
sha256sum my-theme.seerrtheme > my-theme.seerrtheme.sha256
```

Users should validate the package and compare its checksum against the author's
release before installing it.

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
