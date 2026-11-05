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
  modal, navigation, title-card and request owners opt in when the selected theme
  declares the Persius composition. Extra navigation remains available under **More**. Custom packages can
  select the same native composition with `"layout": "persius"` while supplying
  their own ID and stylesheet; no code fork or UI proxy is involved.
- Library segments and genre chips update the existing catalog queries. Series
  stacks and narrator counts describe loaded catalog results, not invented totals.
  Full-cast shelves require explicit full-cast/GraphicAudio metadata.
- Narrations use the native edition catalog, with exact provider work identity
  or a verified title/author lookup. The request retains the original work ID,
  selected provider edition, audiobook format and explicit alongside/replacement
  policy. Another recording's files cannot satisfy that request. Missing provider
  identities cannot be requested. Samples load only after a click and only when
  a provider supplies an HTTPS preview. Edition labels are provider metadata;
  the recommendation chooses a missing unabridged recording in the UI language.
- The future-season switch is stored on TV requests and sent to Sonarr v3/v5 for
  new and existing series. Episode Queue and watch-gate policy take priority.
  Opting out preserves monitoring already established in Sonarr. Existing null
  preferences keep the server default. See [native request flows](native-request-flows.md).
- Requests default to the viewer's active requests. **Active**, **Ready** and
  **All** counts come from the request API. Authorized users can include other
  users through the additional controls. Status actions and byte-based download
  progress use the existing request data and handlers.
- `/coming-soon` groups upcoming movie results by release month and links to the
  existing monitored calendar. Other interface themes continue to use that
  calendar at this route. Dates are parsed without UTC day shifts.
- Season shortcuts feed the existing episode-selection adapter, exclude blocked
  episodes and preserve its metadata readiness guards. Individual episode
  controls remain available in a disclosure after the future-season option, in
  the same visual and keyboard order. PersiusNG dialogs retain keyboard
  focus and restore it to their trigger.

## Native application evidence

The current evidence comes from the compiled production server and Next.js app,
with real local sign-in, saved account preferences, the native theme catalog and
same-origin CSS endpoints. The browser tests provide deterministic catalog,
service-read and artwork fixtures; they do not rewrite the UI or replace the
page components. The server runs with the optional offline test guard and the
browser rejects unhandled external traffic.

| View / native route | Reference desktop viewport | Additional widths |
| --- | --- | --- |
| Discover `/` | 1782 × 1055 | 768, 390 |
| Movies `/discover/movies` | 1788 × 1038 | 768, 390 |
| Movie detail `/movie/:id` | 1782 × 1060 | 768, 390 |
| Series `/discover/tv` and season dialog | 1776 × 1058 | 768, 390 |
| Books `/discover/books` | 1772 × 1064 | 768, 390 |
| Audiobooks `/discover/audiobooks` | 1726 × 1061 | 768, 390 |
| Narrations `/book/:id?format=audiobook` | 1736 × 1046 | 768, 390 |
| Requests `/requests` | 1726 × 1067 | 768, 390 |
| Coming soon `/coming-soon` | 1760 × 1055 | 768, 390 |

The [desktop sheet](evidence/persiusng-native-desktop.jpg),
[phone sheet](evidence/persiusng-native-phone.jpg) and
[native verification report](evidence/persiusng-native-verification.json) record
these routes. Review covered the reference geometry, color and typography,
poster captions, card spacing, shared surfaces, search placement, request actions,
dialog scrolling, keyboard focus and document overflow. The season dialog also
uses an ordinary requester's account, with privileged controls retained for
administrators.

Full-size examples show the [native Requests route](evidence/persiusng-native-requests-1726.jpg)
and season dialog at [desktop](evidence/persiusng-native-season-dialog-1776.jpg)
and [phone](evidence/persiusng-native-season-dialog-390.jpg) widths.

The browser specification exercises library/genre/sort filters, keyboard poster
entry, all/latest/clear season selection, the future-season switch, Escape and
focus handling, narration selection into the native request modal, owner-scoped
request tabs, details/history, loading/empty/error recovery, the theme picker,
light mode and failed-save preservation. A separately named community package
is created by the compiled CLI, installed into the test app, selected, and
restored after reload with its own stylesheet and the native Persius composition.

SeerrOrig and SeerrNGJ are also rendered at 1782 × 1060 and 390 × 844 for movies,
movie details, book details, requests and settings. The matching baseline is the
previous integrated revision `8a72b6db85e63b7560f5498194b22d33034d5d38`.
The verification report records comparison outcomes. Earlier component-only
[evidence](evidence/persiusng-desktop.jpg) remains historical and is used only
as an artwork fixture source by the native browser test.

## Deliberate differences from static mockups

Catalog titles, artwork, ratings, release dates, runtimes, counts, quotas and
availability come from the application data. The test artwork is cropped from
a small reference contact sheet, so its resolution is unsuitable for judging
production artwork quality or claiming a pixel-identical image comparison.
Provider attribution and existing management, filters, playback and request
controls remain available. Missing samples, trailers or edition metadata are
not fabricated. Coming-soon copy does not promise downloads on a theatrical
release date. Light mode and phone layouts are adaptations because the supplied
references specify desktop dark mode.

The native implementation follows the mockups' composition and measurements;
a literal pixel-for-pixel match of live content has not been claimed. Use real
catalog data and the original-resolution references for deployment acceptance.

## Native package and authoring

PersiusNG and custom derivatives load through SeerrNG's same-origin theme API.
Validated manifest metadata selects the composition, so a renamed theme retains
its native pages. `src/proxy.ts` remains Next.js authentication/redirect middleware.
A UI-rewriting proxy is not a runtime dependency, and no external proxy or
production deployment configuration has been changed.

Authoring supports `create → validate → pack → install`, plus inspect, list,
replace and uninstall. Packages carry an independent ID, CSS, composition and
navigation preferences. The compiled CLI works without TypeScript source files;
reproducible bundles have checksum sidecars. See [authoring](authoring.md),
[community submission](submitting.md) and [native request flows](native-request-flows.md).

## Release verification boundaries

The [integration checkpoint](integration-checkpoint-20261030.md) is the current
source of exact suite results and environment exclusions. It supersedes the
previous interrupted-checkout status. Native PostgreSQL execution, live provider
acquisition/external playback and the deployment's original-resolution visual
acceptance remain release-environment checks. No merge, deployment or CI dispatch
was performed as part of this integration.
