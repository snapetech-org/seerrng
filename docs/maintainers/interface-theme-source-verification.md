# Interface theme source verification

SeerrOrig uses the app-owned `upstream` composition. SeerrNGJ keeps its existing
composition and theme package. Theme IDs, account preferences, permissions,
request eligibility and service handlers remain independent of presentation.

## Reference and scope

The reference is the actual upstream Seerr **v3.5.1** container, source
`564bfb08b54caa374bddaf820abfd226e5e69151`, image digest
`sha256:d8fab675b55ad293ded98fd71efcfd46054cbad9746534ae1cc4794a88c0b3be`.
John's regression reference is the published SeerrNG **v3.72.20** image, digest
`sha256:d3ac93c938c80a46563f1091ad06b4b75c6f2b7e0b1f6cbcb055ad87f2f46804`.
An older fork screenshot is not evidence of upstream fidelity.

Common routes compared with upstream: Discover, movie details, series details,
Movies, collections, people, movie/series genres, general settings, Plex settings,
services, users, notifications, logs, jobs and About, plus requests and users. Matching viewports: 320, 390, 768,
1024, 1280 and 1440 pixels, each 900 pixels high. Headless Chromium captures
include expanded seasons, request dialogs, individual episode choices and the
filter drawer. Provider metadata and request destinations are isolated read-only
fixtures; authentication and account theme persistence use the running app.
Actual request submissions and household provider writes are excluded.

The broader gallery covers 94 static and 52 dynamic route templates in both
themes at 390 and 1440 pixels: 584 route captures. These exercise populated
metadata, empty states, service-unconfigured states, loading/recovery and the
legacy issue-detail redirect. They do not establish a successful live round trip
to every external integration. Runtime logs, cache counters and service data
must be compared separately from stable geometry.

## Presentation owners and repaired regressions

- SeerrOrig's manifest selects upstream composition; both the server registry
  and client catalog accept it. Custom theme/account restoration remains tested.
- Its semantic stylesheet owns 256px navigation, 42px pill search, 144/176px
  shelf posters, 128/176/208px detail posters and 38px ordinary controls.
- Video pages restore upstream header actions, open overview/facts/cast, full
  crew links and read-only season accordions. Authorized SeerrNG tools remain
  available under the optional details disclosure.
- Source collections use an open poster header, overview and horizontal movie
  shelf. Existing collection selection and playback tools remain under Details.
- Settings use upstream tabs and a phone selector, open sections, 24px section
  headings, 38px fields and square checkboxes; John retains its compact shell.
- Contextual Swipe remains available from the upstream header.
- Request format menus use existing callbacks and disabled states. Only video/collection entry actions opt into split menus; book/music and
  in-dialog formats remain inline and retain pin controls. The season
  table uses the existing eligibility/selection adapter, including quotas and
  blocked episodes; individual episode choices remain available.
- The episode frame grows to fit larger controls; only its rows scroll. A fixed
  John-sized frame previously collapsed the upstream episode viewport.
- Narrow request summaries retain stacked metadata at desktop viewport widths,
  preventing subgrid tracks from collapsing inside a 448px dialog.
- Search specificity, modal padding variables, long settings labels and form
  inputs have explicit semantic owners. Production QA loads the copied theme
  assets in `dist/interface-themes`; changing source CSS requires refreshing
  those assets and restarting the server before comparison.
- Discover uses the upstream sort/filter drawer flow. SeerrNGJ retains pinned
  filters and compact request controls. Its manifest and stylesheet are unchanged.

SeerrNG branding, supported media categories, integrations and additional actions
remain present. Upstream has no corresponding pages for many of these features;
they reuse its visual roles rather than pretending to be pixel-identical source
screens. Upstream's reference presentation is dark; a light palette is not an
upstream source reference.

## Evidence and regression checks

Evidence from this repair is retained on kspld0 under
`/mnt/disks/scratch/task-deliverables/seerrng-upstream-theme-20261107/`, including
reference/candidate PNGs, route manifests, geometry JSON, browser traces, test
logs and John comparison sheets. The initial gallery compared 292 John route
captures; 281 differed by at most 0.1%, with the remaining differences inspected
as fixture/service data, log paths/counters, image timing or unsettled loading.
Do not report that as whole-app pixel identity.

Maintained checks cover native source composition, private availability,
format callbacks/disabled actions, blocked episode selection, theme restoration,
request summary geometry and individual-episode visibility in both themes.
Existing Cypress video cases explicitly exercise John's compact composition;
Playwright additionally exercises Orig's upstream composition and dialog flow.
The release requires the complete main-branch CI, including browser suites.

Additional source comparison covers 11 common routes at 390 and 1440 pixels
(44 fork captures and 22 actual-upstream captures). Focused browser checks cover
English/Arabic collections, format eligibility and disabled states, book/music
requests, source sorting/filter drawers, contextual navigation, and request
destination/edit tools through their visible disclosures. Older Cypress
John-specific pin/disclosure assertions explicitly select John; source behavior
is exercised independently, rather than assuming those presentations share DOM.

The final static-route sweep found an 8px desktop overflow in Prowlarr settings.
Its footer had fixed negative margins for a padded card. The shared
`settings-form-footer` role now owns that outset; SeerrOrig open forms select
zero while John retains its existing padded-card geometry. Regression checks
cover both themes at 390 and 1440 pixels, including reachable save controls.

Public sign-in, reset-password, Plex loading/error and SeerrNG setup entry
were rendered at 390 and 1440 pixels. Public pages use the default theme before
an account preference is available. Login reuses upstream card padding, mobile
field sizing and Plex branding; SeerrNG transport-security notices remain.
The configured upstream instance redirects setup to login, so its initial setup
wizard is not claimed as a source comparison. Existing setup transport tests
verify the SeerrNG-only entry and rejected-save recovery.

Settings search now confirms actual keyboard focus after a visible destination
is ready, rather than treating a DOM match as success. A delayed-visibility
regression reproduces lost focus on both prior themes; a bounded observer now
tracks visibility/control readiness and schedules focus after layout.

## SeerrOrig rebuild started 2026-11-12

The user reports that the current SeerrOrig presentation still looks materially
unlike upstream. Treat the earlier screenshot gallery and route comparison as
historical evidence only; it does not close this request or prove the user's
current deployment matches those captures. The pinned reference remains the
actual Seerr v3.5.1 source snapshot above.

Source inspection found a concrete navigation divergence: the `flat` profile
reordered Seerr's eight primary links but left every SeerrNG-only route in the
same visible list. This first rebuild slice preserves the upstream primary
order and moves fork-only routes into a native collapsible “More” disclosure.
Permission and enabled-media filtering still happens before the menu is split.

The screenshot archive noted above is not available in this checkout. Candidate
rendering and matched upstream comparisons have not yet been repeated for this
rebuild. Remaining scope includes the shared header, discovery, detail, search,
settings, request, and fork-only page families; visual acceptance remains
unverified until matching routes, states, and viewports are rendered.

The next presentation slice removes the compact SeerrNG Discover/Swipe switch
from the SeerrOrig header, pins gray/indigo/purple utility tokens to upstream
Tailwind values regardless of the account palette, removes the gradient page
heading, and hides SeerrNG-only book/music shelves from the upstream Discover
home. The theme provider now applies the upstream dark palette for SeerrOrig;
the account's chosen palette and light/dark preference are preserved and resume
when another design is selected. Fork destinations and slider configuration
remain available through the existing SeerrNG routes and editor. These
source-level changes have not yet been rendered or compared in a browser.

The settings shell follows upstream's native tab list, order, breakpoints,
spacing, and page wrapper. Fork-only settings routes, settings search, display
preferences, and the shared save bar remain available through a collapsed
“More settings” area or when edits need saving. SeerrNG's existing branding
assets remain in use. This source-level alignment is not a visual acceptance
result; matched route and viewport screenshots still need to be rendered.

The Search route now uses upstream's PageTitle, Search Results heading, and
ListView composition. Fork-only catalog categories and advanced filters are
available under “More search options”; the default SeerrOrig result list shows
only movies, series, and people. When an extended category fills an earlier
page, the list continues paging until it finds native results or reaches the
end. This source-level change still needs matched route and viewport renders.

The request list now uses upstream's combined heading and three native filter
controls for media type, status, and sort. SeerrNG's added request media types,
status filters, and sort options remain under “More request filters.” Existing
request rows, service errors, profile scoping, pagination, and permissions are
still rendered from the fork's data and actions; visual alignment of those
rows and footer remains under review.

Movie and TV detail pages now share the upstream v3.5.1 media-page frame,
responsive artwork header, facts panel, crew list, and cast slider. Movie
release/certification, collection, and keyword details, plus TV season,
network, content-rating, and provider data, are rendered in upstream hierarchy.
SeerrNG request, playback, issue, quality, and service controls remain connected
through the detail action slots. Person cards in SeerrOrig use the upstream
card component; other interface themes retain the fork card. This is source
alignment only: matching browser renders have not yet been produced.

The person page retains the upstream profile, biography, credits, and native
movie/series filter. SeerrNG's credit sort, follow action, and bulk movie
request are reachable in a collapsed “More person options” disclosure. The
same route and viewport render comparison remains outstanding.
