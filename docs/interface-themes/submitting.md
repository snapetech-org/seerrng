# Submit a SeerrNG theme

A community theme is an independent source directory and a `.seerrtheme` file.
Users can install it without a fork of SeerrNG, executable plugins, or a
UI-rewriting proxy. It does not have to become a built-in theme.

## Prepare a release

1. Create a permanent lowercase ID. Set your name, description, author, license
   and semantic version in `manifest.json`.
2. Make the scoped `theme.css` your own. Start with
   `pnpm interface-theme:create my-theme --from persiusNG` or another installed
   base. Preserve the base's license and attribution in your source release.
3. Run `pnpm interface-theme:validate ./my-theme`, then
   `pnpm interface-theme:pack ./my-theme`. Keep the generated `.seerrtheme` and
   `.seerrtheme.sha256` together. The packer ignores the README and other source
   files; only validated metadata and CSS enter the package.
4. Validate the generated package, install it on the SeerrNG version you support,
   and test through the native application. Record exact versions and browsers.
5. Publish the source, package, checksum, license and screenshots at stable URLs,
   for example a tagged repository release. Describe unsupported states honestly.

## Request community review

Use the [theme submission form](https://github.com/snapetech-org/seerrng/issues/new?template=theme_submission.yml).
Include the source tag/commit, package and checksum URLs, package ID/version,
license, supported SeerrNG releases and screenshots. If GitHub will not attach
the `.seerrtheme` file directly, link to it on your source release. Do not rename
an archive to `.seerrtheme`: the actual package format is validated JSON.

The form opens a review request; it does not automatically install, execute,
approve or publish your theme as an official built-in. Maintainers can review the
exact source and reproducible bundle before sharing it with users. A built-in
theme proposal needs a normal pull request and the repository's UI review gates.

## Review checklist

- Independent ID, clear author/version/license, complete source and matching checksum.
- Every selector scoped to that ID; no scripts, imported CSS, URLs or remote assets.
- Layout choice recorded: `classic`/omitted or `persius`. Persius composition
  needs a release with the native PersiusNG implementation.
- Desktop and phone screenshots, with viewport dimensions and light/dark modes.
- Discover, movie/series catalogs, book/audiobook catalogs, details, requests,
  calendar, settings and authentication checked where enabled.
- Long titles, loading, empty, failed, available, shared and requested states checked.
- Keyboard focus, menus/dialogs, reduced motion, responsive overflow and contrast checked.
- Request/cancel, playback, filters, season/episode selection and narration choice
  tested on a running instance with appropriate permissions and services.
- Account persistence, switching away/back and explicit `--replace` upgrade checked.
- Known limitations listed. Static previews or mocked fixtures identified as such.

## Publish an update

Keep the ID and increase the version. Generate a new bundle and checksum, publish
release notes and retain the previous validated package. Users explicitly install
the update with `--replace`, restart SeerrNG and reload; their account selection
continues to use the same ID. A new ID is a separate theme.

See the [authoring guide](authoring.md) for commands, supported CSS and package
limits. Community submissions do not add a new automatic CI workflow; repository
validation remains subject to the existing private-runner policy.
