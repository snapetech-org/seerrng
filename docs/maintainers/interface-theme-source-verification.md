# Interface theme source verification

SeerrOrig uses the app-owned upstream composition. SeerrNGJ keeps its existing
composition and theme package. Theme selection, account preferences,
permissions, request eligibility, service handlers, and SeerrNG branding remain
independent of presentation.

## Reference and acceptance scope

The visual reference is Seerr v3.5.1 at upstream source commit
`564bfb08b54caa374bddaf820abfd226e5e69151`. Shared pages should follow its
layout, controls, spacing, media framing, typography, and interaction. Keep the
SeerrNG logo and identity assets.

Source inspection alone does not establish visual parity. Compare the same
route, data, UI state, and viewport against upstream before marking a page
visually verified. Include loading and empty states where the page has them.
Keep the default dark palette aligned with upstream. Do not use a SeerrNGJ
screenshot as the upstream reference.

Fork-only pages and features have no upstream page to copy. Reuse upstream
components and presentation roles where they fit, and keep extra controls
reachable in a clear extension area. Do not remove SeerrNG integrations or
permissions to simplify a page.

## Presentation ownership

- The SeerrOrig manifest selects upstream composition. The server registry and
  client theme catalog both recognize it.
- The SeerrOrig stylesheet owns upstream navigation, search, cards, detail
  posters, controls, and responsive spacing. SeerrNGJ styles remain separate.
- Movie and TV detail routes use upstream framing, metadata hierarchy, crew,
  cast, seasons, and collection presentation. SeerrNG actions stay connected.
- Collections use the upstream backdrop, responsive header, status, and movie
  slider. SeerrNG collection tools remain available in the extension area.
- Settings, search, requests, people, and issues use upstream page hierarchy
  and primary controls. Fork-only settings and filters remain available through
  their extension areas.
- Movie and TV issue routes use the upstream issue card and detail presentation.
  Additional issue media types keep their existing fork detail flow.
- User profiles use the upstream quota summary and media-slider hierarchy.
  SeerrNG quota categories, watchlist entries, and avatar editing remain
  available.
- The Users page uses the upstream toolbar, sortable table, selection controls,
  and row hierarchy in the repository's shared scrollable table. SeerrNG-only
  user filters and TV queue tools remain in a collapsed extension area.
- The Blocklist page uses upstream's native filters, movie/TV cards, empty
  state, pagination, and removal controls. SeerrNG's expanded media types,
  filters, and metadata remain reachable in its extended view.
- Shared buttons, badges, alerts, headers, and modal framing use upstream
  presentation in SeerrOrig while the SeerrNG theme keeps its own component
  styling and behavior.
- The shared Header component uses the upstream v3.5.1 heading markup and responsive spacing in SeerrOrig.
- The SeerrNG-only release calendar reuses SeerrOrig's upstream Header, alert, badge, control, and card presentation while retaining its cross-media release data.
- SeerrNG logos and brand assets remain in use throughout SeerrOrig.

Changing theme source styles requires rebuilding the packaged theme assets and
restarting the application before visual comparison.

## SeerrOrig rebuild started 2026-11-12

The user reports that SeerrOrig still looks materially unlike upstream. Earlier
screenshots do not close this request. The pinned Seerr v3.5.1 source remains
the reference.

The primary navigation now follows upstream order. Fork-only destinations are
available under a collapsible “More” section, after permission and enabled-media
filtering.

Discover uses the upstream header and shelf hierarchy with the upstream dark
palette. SeerrNG-only shelves and display preferences remain available through
existing routes and settings.
The Upcoming Movies route uses the same upstream heading spacing and error fallback while retaining SeerrNG's navigation context. The Upcoming Series route now follows the same upstream heading and error presentation.


Settings use upstream tabs, ordering, breakpoints, spacing, and page wrapper.
SeerrNG-only settings and tools remain under “More settings.”

Search uses upstream's heading and result-list presentation. Fork-only catalog
categories and advanced filters remain under “More search options.” The
Requests page uses upstream's primary controls, with SeerrNG request categories
and filters under “More request filters.”

Movie and TV detail pages use upstream's responsive media frame, facts, crew,
cast, seasons, and collection hierarchy. Request, playback, issue, quality, and
service actions continue to use SeerrNG handlers. Person pages use the upstream
profile and media filter, with fork-specific sorting and request actions under
“More person options.” Collections use upstream's backdrop, media header,
aggregate status, and movie slider while retaining SeerrNG collection tools.

The Issues list uses upstream's heading, primary filters, movie/TV cards, empty
state, and pagination. Movie and TV issue links open the upstream detail page,
including its facts, comments, and actions. SeerrNG issue filters remain under
“More issue filters”; fork-only media types keep their inline detail flow.

User profiles use the upstream quota-card and media-slider hierarchy. SeerrNG
music, book, comic, and magazine quotas and watchlist entries remain available
in collapsed extension sections. The SeerrNG avatar editing action remains
available.

The Users page follows upstream's action/search/sort toolbar, sortable table,
row hierarchy, and actions inside the shared scrollable table card. It keeps the
repository's one-set user list, shared selection circles, table geometry, and
standard filter/action owners. SeerrNG's account-type/role filters and TV season
queue tools remain available under collapsed extension areas.

The Issues list uses the shared pagination footer and starts with All Issues
selected. The upstream presentation does not change the repository's paging
controls or default task filter.

The Blocklist page now uses upstream's original movie/TV card presentation and
filter/pagination controls. The expanded SeerrNG blocklist remains available
from the collapsed extension disclosure, including extra media types and
metadata.

Genre, keyword, and language discovery routes use upstream's loading and error
fallbacks and heading spacing. SeerrNG genre-follow actions remain reachable
under a collapsed “More options” disclosure.

Network and studio discovery pages use upstream's metadata-backed title and
logo header, heading spacing, and result-list presentation. The genre directory
pages use upstream's card image resolution and route links, plus upstream's
loading and error fallbacks.

The watchlist page uses upstream's title, owner subheading, spacing, and default
list presentation. SeerrNG's watchlist search, media, and sort filters remain
available under a collapsed “More options” disclosure.

Trending restores upstream's movie/series/person results with its daily/weekly
controls in SeerrOrig. Main movie and series discovery show upstream's plain
error fallback; SeerrNG's retry panel and multi-catalog trending tabs stay in
the native theme.

Notification settings use upstream's page heading and provider-tab button
spacing in SeerrOrig. The SeerrNG-only Apprise provider remains available from
the collapsed “More settings” route list.

User settings show upstream's primary tabs in SeerrOrig; SeerrNG-only maturity,
season-rule, episode-queue, advanced-theme, and client-token routes remain
available under a collapsed “More settings” disclosure.

Common buttons, badges, alerts, page headers, and dialogs now switch to
upstream's shared-control presentation when SeerrOrig is selected. SeerrNG's
own variants and behavior remain active in its native theme.

Dropdown and split-button menus use upstream's trigger sizing, menu surface,
transition, item presentation, and primary/ghost roles in SeerrOrig. Fork-only
action types map to the closest upstream visual role; the SeerrNG theme keeps
its current menu presentation and action variants.


Movie and TV request rows retain upstream's responsive card hierarchy and
request actions. SeerrOrig now also uses the upstream horizontal backdrop fade;
SeerrNG's extra media types and request-failure information remain in their
existing card roles.

Shared movie, TV, and collection poster cards now use upstream's frame and
hover shadow, backdrop gradient, title and summary typography, type-badge
geometry, and status-badge sizing. SeerrNG's additional poster actions and
media-specific information remain available. The card treatment still needs
matched rendered comparison against upstream before it can be marked visually
accepted.

Public sign-in, password-request, and password-reset screens use the
upstream full-screen backdrop and centered form composition. SeerrOrig uses
upstream's original-resolution backdrops and gradient without the fork-only
title caption. SeerrNG logos, transport-security messaging, and additional
sign-in options remain. Setup keeps its upstream backdrop and stepper framing
while retaining the expanded SeerrNG onboarding path.

## Visual review status

The current rebuild has not yet had matched upstream and SeerrOrig renders for
all routes, states, and viewports. Keep this pull request in draft until the
remaining page families are aligned and those comparisons have been reviewed.
The current workspace has no installed frontend dependencies or running
candidate server, so browser captures are not yet available. Source-level
alignment is not counted as rendered visual acceptance.
