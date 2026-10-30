# PersiusNG

Select **Theme picker → Interface design → PersiusNG**. The existing account
preference and same-origin theme loader save and load this choice. The default
theme remains SeerrOrig.

PersiusNG follows the nine owner-provided October 30, 2026 mockups: a charcoal
canvas, lavender controls, outlined navigation, posters with captions underneath,
wide discovery features, compact request cards and a grouped release calendar.
Its manifest selects `layout: persius`. Its package owns the visual values; application components retain catalog data,
permissions and request mutations.

## Design measurements

| Element                                 | Desktop value                                       |
| --------------------------------------- | --------------------------------------------------- |
| Canvas / panel / raised panel           | `#0b0d11` / `#14171d` / `#1b1f27`                   |
| Border / lavender / selected navigation | `#2a303b` / `#8ba5ff` / `#1c2547`                   |
| Sidebar / top bar / search field        | 244 px / 70 px / 560 × 42 px                        |
| Content including gutters               | 1,320 px maximum; 40 px gutters                     |
| Page title / section heading            | 40/48 px / 20/26 px                                 |
| Discovery feature                       | 564 × 352 px; 22 px radius                          |
| Desktop poster grid                     | Six columns; approximately 192 × 288 px; 18 px gaps |
| Discovery shelf / audiobook shelf       | 164 × 246 px / 180 × 180 px                         |
| Request row / release card              | 615 × 136 px / 408 × 104 px                         |
| Season dialog / season row              | 640 px wide / 65 px high                            |

At desktop widths of 1,600 px and above, the content starts approximately 396 px
from the viewport edge, matching the references' nearly constant left alignment.
Smaller screens use fluid gutters, fewer poster columns, single-column request
cards and a scrolling dialog. Light mode is an adaptation; the supplied references
only specify dark mode.

## Behavior and ownership

- `themes/persiusNG/` contains the scoped stylesheet and validated manifest.
  The application adds the built-in ID to the shared registry and client fallback.
- `src/components/Persius/` contains presentation components. Existing page,
  modal, navigation, title-card and request owners opt in only when PersiusNG is
  selected. Extra navigation remains available under **More**. Custom packages can
  select the same native composition with `"layout": "persius"` while supplying
  their own ID and stylesheet; no code fork or UI proxy is involved.
- Library segments and genre chips update the existing catalog queries. Series
  stacks and narrator counts describe loaded catalog results, not invented totals.
  Full-cast shelves require explicit full-cast/GraphicAudio metadata.
- Narrations come from catalog results matching the current title and author.
  Requesting a selected recording passes that exact book ID and audiobook format
  into the existing request modal. Availability, pending requests, service setup
  and permissions still govern the actions.
- Requests default to the viewer's active requests. **Active**, **Ready** and
  **All** counts come from the request API. Authorized users can include other
  users through the additional controls. Status actions and byte-based download
  progress use the existing request data and handlers.
- `/coming-soon` groups upcoming movie results by release month and links to the
  existing monitored calendar. Other interface themes continue to use that
  calendar at this route. Dates are parsed without UTC day shifts.
- Season shortcuts feed the existing episode-selection adapter, exclude blocked
  episodes and preserve its metadata readiness guards. Individual episode
  controls remain available in a disclosure. PersiusNG dialogs retain keyboard
  focus and restore it to their trigger.

## Validation and evidence

The committed [contact sheet](evidence/persiusng-desktop.jpg) shows component
fixtures, not a running SeerrNG installation. The fixtures use the actual shared
components, PersiusNG components and application styles, with mocked session,
router, API and image-loader boundaries. Artwork was cropped from the supplied
references for comparison; those crops are not runtime application assets.

| View / target route                     | Reference viewport |
| --------------------------------------- | ------------------ |
| Discover `/`                            | 1782 × 1055        |
| Movies `/discover/movies`               | 1788 × 1038        |
| Movie detail `/movie/:id`               | 1782 × 1060        |
| Series request dialog `/discover/tv`    | 1776 × 1058        |
| Books `/discover/books`                 | 1772 × 1064        |
| Audiobooks `/discover/audiobooks`       | 1726 × 1061        |
| Narrations `/book/:id?format=audiobook` | 1736 × 1046        |
| Requests `/requests`                    | 1726 × 1067        |
| Coming soon `/coming-soon`              | 1760 × 1055        |

All nine fixtures rendered without browser exceptions at those sizes and without
document overflow at 390 × 844 and 768 × 844. The
[measurement report](evidence/persiusng-render-measurements.json) records their
dimensions and interaction checks. Checks covered season clear/latest/all and
individual selection, blocked episode exclusion, dialog Tab wrapping and focus
restoration, narration selection, the search shortcut, light-mode switching and
a theme-picker round trip. A renamed custom theme also preserved the native
sidebar, account label and request composition with its independent CSS palette.

The shared sidebar, search, buttons and six-poster fixture was also rendered at
1782 × 1060 using the original source from base commit
`471271589e28a77a2e1564b2ef4e1c152e7cf103` and the candidate source, separately
under SeerrOrig and SeerrNGJ. Both comparisons had zero changed pixels.

Twenty-four focused tests passed: six CLI package round trips, ten package/registry/
stylesheet-route checks, two actual ThemeProvider integration tests and the existing
six-test season request payload adapter.
Changed TypeScript files were parsed and formatted. A complete application build
and project typecheck were not available in the partial repository snapshot;
missing application modules prevent treating its partial semantic check as a
project-wide pass. No CI workflow was requested or run.

## Acceptance still requiring the running application

Production UI acceptance and a pixel-for-pixel match remain **unverified**. The
fixtures do not exercise full page composition, a production Next.js build,
real request mutations, signed-in permission/service combinations, notifications,
downloads or external playback. Validate those on a running instance before
marking the UI complete, as required by `AGENTS.md`.

Catalog content, artwork, ratings, runtimes and counts remain real data. The mockup's
narration samples, recommendation labels, recording edition tags and automatic
future-season toggle have no verified equivalent in the current interfaces and
are not fabricated. The existing detailed request controls remain reachable.
Coming-soon copy also avoids promising downloads on theatrical release day.

For final acceptance, enable PersiusNG on the running instance and revisit the
routes above at their listed viewports. Check ordinary and privileged accounts,
disabled services, empty/error/loading states, available/shared/pending/failed
media, partial-season requests, narration requests and both responsive widths.
Recheck representative settings, library, playback and administration pages in
all three themes before merging.

## Native package and authoring follow-through

PersiusNG and custom derivatives load through the application’s same-origin theme
API. The native composition is selected by validated manifest metadata, so a
renamed theme retains the same functional pages. `src/proxy.ts` is Next.js
authentication/redirect middleware, not a theme rewriter; it remains intact.
A separate UI-rewriting proxy is not a runtime dependency of this implementation.
Retiring an existing external deployment should still follow the running-app
acceptance checks above; no external proxy configuration was changed here.

Authoring has a direct `create → validate → pack → install` workflow. Source
commands run without a complete server build, the packer writes reproducible
JSON bundles and checksums, and source/bundle inspection is available. Six CLI
round-trip tests and two actual ThemeProvider tests cover independently named
Persius compositions, same-origin stylesheet loading, account restoration and
failed-save preservation. See [authoring](authoring.md) and
[community submission](submitting.md).
