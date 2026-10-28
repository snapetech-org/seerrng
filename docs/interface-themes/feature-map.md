# SeerrNG Feature and Interface Map

## Product and engine decision

Keep the current SeerrNG engine, server, APIs, libraries, migrations, media
providers, authorization checks, and feature implementations. Use upstream
Seerr `v3.5.1` (`564bfb08b54caa374bddaf820abfd226e5e69151`) as the source of
truth for SeerrOrig's established visual choices and video flows. Keep John’s
current SeerrNG design as SeerrNGJ. Theme changes select a full interface
system; they do not change a feature's data, provider, permission, API, or
request semantics.

## Design systems

| Design area | SeerrOrig | SeerrNGJ |
| --- | --- | --- |
| Primary nav | One flat list in upstream order: Discover, Movies, Series, Requests, Blocklist, Issues, Users, Settings; current extra routes follow the core links | Grouped headings and nested acquisition/discovery links, matching the current SeerrNG navigation model |
| Surfaces and color | Slate-gray page and sidebar, gray-800 cards, compact borders, indigo-to-purple selected nav, original Seerr gradients | Deep navy background, blue/silver chrome, blue selected nav, colored media/status controls, layered borders and restrained glow |
| Discovery cards | 150px-wide classic poster cards, tighter corners, understated frame and bottom title gradient | 169.2px poster cards, rounded framed surface, blue/silver edge, stronger hover elevation and data-dense badges |
| Detail pages | Centered poster/title at narrow widths; poster and title align horizontally at wide widths; facts in a compact slate card | Left-anchored hero, framed poster, blue contrast, overview paired with a right facts rail at wide widths |
| Custom media | Preserve current media types and controls while using the compact Orig poster and card roles | Preserve current data-rich poster badges and use the NGJ frame, category accents, and detail arrangement |
| Interaction | Keep current SeerrNG actions and accessibility contracts; apply original visual geometry and ordering where the upstream component still has the same concept | Keep the current grouped workflows and John-specific visual order, controls, and shapes |

## Route-family coverage map

Every route remains on the existing SeerrNG router and API. The visual system
owns presentation through shared roles, `data-interface-theme`, and the three
theme stylesheets. The matrix records where to audit behavior and theme parity;
it does not imply that each listed route has already passed visual review.

| Feature family | Current route source | Shared visual contracts to audit | Theme-specific expression |
| --- | --- | --- | --- |
| Home and discovery shelves | `src/pages/index.tsx`, `src/pages/discover/**` | page title, section shelves, filters, poster grid/slider, empty/loading/error states | Orig uses compact shelves and classic poster cards; NGJ uses grouped sections, expanded card frames, and vivid category badges |
| Video catalogs | `src/pages/discover/movies/**`, `src/pages/discover/tv/**` | filter bars, grid sizing, pagination, provider/genre facets, poster actions | Orig restores upstream filter and poster density; NGJ keeps expanded filters, detail badges, and current card emphasis |
| Video details | `src/pages/movie/**`, `src/pages/tv/**`, `src/pages/series/**`, `src/pages/collection/**`, `src/pages/franchise/**` | hero, title metadata, overview, facts, ratings, cast/crew, recommendations/similar, request and playback actions | Orig uses upstream centered-to-horizontal hero and compact facts; NGJ uses left-anchored hero and split overview/facts composition |
| Music and artist catalog | `src/pages/discover/music/**`, `src/pages/music/**`, `src/pages/artist/**` | artist/album posters, quality and library state, ratings, discography and actions | Orig keeps the compact poster and simple card frame while retaining music-specific labels; NGJ keeps album quality/status badges and colored controls |
| Books and audiobooks | `src/pages/discover/books/**`, `src/pages/discover/audiobooks/**`, `src/pages/discover/book-recommendations.tsx`, `src/pages/book/**`, `src/pages/author/**`, `src/pages/book-series/**` | format badges, author and series navigation, request-format choices, reading/list state | Orig uses the familiar poster and flat metadata rhythm; NGJ emphasizes format/status slots and grouped recommendations |
| Comics and magazines | `src/pages/discover/comics/**`, `src/pages/discover/magazines/**`, `src/pages/comic/**`, `src/pages/magazine/**` | identity, issue/tracking state, request availability, cover ratio, status and error states | Preserve cover aspect and tracking semantics in both; vary frame, badge geometry, and facts layout |
| Software and games | `src/pages/software.tsx`, `src/pages/games.tsx`, `src/pages/discover/games.tsx`, `src/pages/sportarr/**` | platform/library badges, compatibility facts, monitoring/request state, safe external actions | Orig uses a subdued catalog card; NGJ keeps high-contrast library and monitoring states with category-coded badges |
| Sports, adult, and people | `src/pages/discover/sports/**`, `src/pages/discover/adult/**`, `src/pages/adult/**`, `src/pages/person/**` | eligibility/age gate, external identity, role/credit hierarchy, request availability | Preserve policy and role distinctions; change card proportion, hierarchy, and badge treatment per system |
| Requests and acquisition | `src/pages/requests/**`, `src/pages/track-requests.tsx`, `src/pages/downloads.tsx`, `src/pages/indexer-search.tsx`, shared request modals | queue/list hierarchy, status, quality, form validation, destructive actions, busy/error feedback | Orig follows compact upstream request rhythm; NGJ uses denser grouped panels and strong status accents |
| Libraries and saved items | `src/pages/library.tsx`, `src/pages/games.tsx`, `src/pages/profile/watchlist.tsx`, `src/pages/discover/watchlist.tsx`, `src/pages/collections/**` | tabs, sort/filter, watchlist actions, collection hierarchy, availability and empty states | Orig uses flat gray cards and upstream spacing; NGJ separates groups with framed panels and badge-led states |
| Following, calendar, swipe, sharing | `src/pages/following.tsx`, `src/pages/calendar.tsx`, `src/pages/swipe.tsx`, `src/pages/share.tsx`, `src/pages/identify.tsx` | timeline/list hierarchy, swipe hit targets, identity and sharing safety, overlays | Orig uses simple surfaces and classic action rows; NGJ uses grouped cards, category framing, and strong selected states |
| Issues and blocklist | `src/pages/issues/**`, `src/pages/blocklist/**` | triage, issue detail, permissions, confirm/cancel, hidden-item and recovery state | Orig keeps flat tables/cards and compact confirmation; NGJ distinguishes destructive and review states with color and framed panels |
| User management and profile | `src/pages/users/**`, `src/pages/profile/**` | permissions, linked accounts, notification forms, user request queues, account theme choices | Orig follows upstream compact form and profile hierarchy; NGJ uses grouped form sections and framed information cards |
| Admin and integrations | `src/pages/settings/**`, `src/pages/setup.tsx` | service setup, connection state, credentials, jobs/logs, category controls, warnings | Orig uses original Seerr slate panels and straightforward rows; NGJ uses blue/silver service panels and distinct status/action colors |
| Authentication and recovery | `src/pages/login/**`, `src/pages/resetpassword/**`, `src/pages/404.tsx`, `src/pages/_error.tsx` | keyboard access, error recovery, auth return path, disabled and loading states | Orig restores upstream visual weight and straightforward buttons; NGJ uses current shell/brand treatment without changing auth behavior |

## Behavior and component contract boundaries

- Existing endpoint contracts and service-library choices remain SeerrNG's.
- Permission and service-availability filtering stay on each navigation link;
  only its visual order and grouping vary.
- Requests, watchlist, blocklist, library state, external links, media identity,
  age gating, and provider actions keep the current component handlers and
  server authorization.
- Both profiles use current shared semantic classes and `data-*` regions.
  Do not fork feature components solely to restyle them.
- SeerrOrig should reproduce the upstream look and flow when the equivalent
  upstream component exists. Current cross-media features use a consistent
  Orig translation of those roles; they must not be removed because v3.5.1 did
  not contain them.
- SeerrNGJ retains its current grouped navigation, data-rich catalog behavior,
  and John-specific visual treatment. The existing `john-redesign` advanced
  color preset remains separate and can continue to customize the NGJ colors.

## Scope and verification status

There are 149 files under `src/pages/` in the rebuilt checkout. Route families
above are the audit map, not a claim that 149 routes have already been rendered.
See `implementation-status.md` for the current gate status and remaining
coverage.
