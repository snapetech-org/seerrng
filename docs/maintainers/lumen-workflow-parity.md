# Lumen workflow parity

Lumen should support the SeerrNG workflows a signed-in user or administrator is
authorized to use. The bundled `/lumen/` frontend and the independent companion
both need working entry points. Native routes remain the behavioral reference
during migration. A link into full SeerrNG does not establish Lumen parity.

> The inventory below comes from the native route tree and navigation model
> and Lumen's route table, sidebar, mobile tabs, and API consumers. A route
> match is evidence of reachability only. Compare the behaviors inside it.

## Workflow inventory

| Area                       | Native reference                                                                | Lumen baseline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Parity work                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery and search       | `/`, `/search`, `/discover/*`                                                   | Lumen browses and searches enabled movie, series, book, audiobook, music, comic, magazine, game, patch, sports, and adult catalogs, with Following and linked discovery pages. Personal Discover shelves and display controls sync through the authenticated SeerrNG user settings API. Direct routes, navigation, Search, Discover shelves, Watchlists, and My Media enforce global and per-account category access before loading catalogs. Discover shell labels, shelf headings, empty/error/retry states, recent-media dates, and card title-view actions follow English, French, and Arabic locale in standalone and bundled deployments. Trending localizes its media/time filters and load/empty states and retains API filters after retry. Music discovery and its album/artist detail pages localize their page-owned labels, filters, metadata headings, track groups, format-specific MP3/FLAC requests, empty/error feedback, and paging. Artist detail groups releases by MusicBrainz secondary type, shows localized release-type headings and counts, and can load the full group up to the same 1,000-release bound as native SeerrNG. Music's secondary filters use an accessible disclosure that opens for bookmarked filters, keeping the first results clear of the phone navigation. Each music format checks configured service targets, availability, blocklist and open-request state, allows authorized destination selection, and submits the chosen server ID. Adult scene details let request-option-authorized users choose the Whisparr destination and load that destination's status before submission. The phone action bar keeps the service selector and request action inside its viewport. Shared music/adult request buttons localize the default label and success/failure feedback.                                                                                                 | Finish other route localization, matched native visual acceptance for broader detail layouts, and verify remaining live provider data separately.                                                                                                                                                                                                                                  |
| Software and games         | `/software`, `/discover/games`, `/discover/patches`, `/games`                   | Game Finder, PC/retro/modern catalogs, patch discovery and requests, software request history, My Games, household sharing, and Steam import are present. Focused software request history and its permission-aware management actions are verified in standalone and bundled Lumen. IGDB catalog detail now adds eligible games directly to the viewer's private My Games library without requiring software request permission. Game detail also shows Steam ownership, safe YouTube videos, and all available playtime estimates in localized metadata. The ROM patch catalogue and patch request detail localize filters, project status, version/system selection, compatibility recovery, and request feedback in English, French, and Arabic; submitted request identity and payload are unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Verify live acquisition and imports, remaining catalog/content actions, and native-matched visual acceptance.                                                                                                                                                                                                                                                                      |
| Library and saved items    | `/library`, `/profile/watchlist`, `/discover/watchlist`, `/share`, `/following` | My Media, personal and Discover Watchlists, Share, Following, availability/play links, and private/household Games have dedicated screens. Share and Identify now localizes its recognition, image, candidate matching, series selection, and request feedback workflow in English, French, and Arabic. Movie, TV, book, music, comic, and magazine poster cards expose safe Watchlist add/remove actions. My Media supports account recovery, private identity mapping packs, tracking updates, and resumable scans. Native SeerrNG has a self-only `/library` page and delegated `/users/:id/watchlist`; no separate delegated My Media route exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Verify live provider mutations and complete native-matched/bundled acceptance.                                                                                                                                                                                                                                                                                                     |
| Calendar and group viewing | `/calendar`, `/coming-soon`, `/swipe`, `/watch-sessions`                        | Release Calendar supports the native month, media, authorized scope, and administrator unmonitored filters, plus partial/truncated/empty states and title destinations. Its copy and release details are localized for English, French, and Arabic in standalone and bundled deployments. Coming Soon provides a contextual Release Calendar link, localized with the saved account locale. Swipe and watch-session creation, invitations, ballots, membership, and confirmed host/guest actions are implemented.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Verify live calendar provider results, real multi-user playback, and remaining native-matched and bundled acceptance.                                                                                                                                                                                                                                                              |
| Requests                   | `/requests`, `/track-requests`, user request routes, detail request dialogs     | Request history and lifecycle, title/edition identity, progress, permission-aware retry, explicit Sonarr season mapping, managed-copy cleanup that preserves history, and supported 4K paths. Lumen’s TV request state covers exact season and episode selection across multiple seasons, quota approval, destination-specific settings, bounded metadata recovery with selection preservation, and localized episode selection/recovery in English, French, and Arabic. Episode metadata requests are split into five-season client batches to keep provider work per request bounded; failed seasons retry independently, and episodes from completed batches stay selectable while later batches load. Submission waits for metadata completion and includes only selected episode identities.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Compare each media category independently; verify live season metadata and service handoff, and finish matched native visuals. Request-role fixtures cover own-request scope, household visibility, manager moderation, owner cancellation, category-authorized retry, season mapping, and managed-copy removal. Fixtures do not establish live provider timing or server handoff. |
| Acquisition tools          | `/downloads`, `/indexer-search`                                                 | Download Inbox supports warning/history, manual import and rejection; Indexer Search supports category-aware search, pagination, one-use handoff, and native-compatible B/KB/MB/GB/TB size formatting. Both destinations are reachable from the mobile You menu when the signed-in user has the matching permission. Download Inbox import and rejection states have matched native/Lumen fixture comparisons at desktop and phone sizes; its action choices and safeguards are present in both layouts. Populated Indexer Search native/Lumen fixture captures are matched at desktop and phone sizes; narrow screens keep result titles readable when indexer details and actions are visible. Prowlarr's introductory copy is visible in configured, disconnected, and no-category states, following native behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Verify live Prowlarr/download-client handoff and finish any remaining destination behavior gaps.                                                                                                                                                                                                                                                                                   |
| Issues and blocklist       | `/issues`, `/issues/[issueId]`, `/blocklist`                                    | Lumen supports issue reporting, discussion, editing/deletion, filters, pagination, and permission-aware blocklist browse, removal, detail and collection actions. Blocklist media types match the API's supported movie, TV, music, book, comic, and magazine set; canonical identity and view/manage permissions are fixture-covered in standalone and bundled builds. Administrator Discovery settings configure automatic keyword and movie/TV genre rules. Issue rows show the media poster/title and format, localized release/runtime facts, creator/date/description, issue type and valid media-specific reason, selected TV season/episode context, status, a direct detail link, and the inline discussion disclosure. The issue detail summary localizes that subtype, and invalid cross-media subtypes remain hidden. Reporter names follow the native VIEW/MANAGE issue permission boundary. Permission and list workflows pass the four-project standalone suite. Mobile issue-list, issue-detail and Blocklist states were inspected in standalone and bundled builds; comment action clearance above fixed tabs is asserted. Native issue list/detail comparison now renders at desktop and iPhone sizes. Issue discussions expand and collapse inline using the existing permission-checked discussion workflow while retaining a direct detail route; desktop, iPhone, Android, and tablet fixtures cover expansion, posting, collapse, and URL preservation. Issue filters use native Task, Media, Filters, and Sort By disclosure groups while preserving URL state, search submissions, and media-specific metadata. Expanded TV discussions resolve selected episode numbers to names and provide localized loading, empty, and retryable error states. The issue browser suite covers desktop, iPhone, Android, and tablet. Live TMDB season metadata remains unverified.                              |
| Accounts                   | `/profile/*`, `/users/*`                                                        | Account Settings/password, linked accounts, client tokens, notifications, household profiles, TV request access, per-user Episode Queue defaults, maturity limits, and delegated user management are implemented. Local account creation now confirms the created profile before closing and retries readback by assigned user ID; deletion keeps its confirmation open until a fresh lookup confirms absence. Native `/users/:id` and `/profile/*` profile, request, watchlist, and settings bookmarks now redirect to Lumen equivalents with filters preserved and self/manager access enforced. Profile settings links target their existing account subsections, including notification-channel anchors. Account Settings persists the native per-user display locale; general profile fields, password, permissions, linked-account, client-token, personal-notification, household-profile, playback, and request-limit copy follows the supported locale. Account Settings also exposes native per-service default request folders for users with request management, advanced request, or administrator permission; saved paths survive unavailable services, and successful saves are verified through the settings read endpoint. The saved-language account suite passes 88 cases in each standalone and bundled build across desktop, iPhone, Android, and tablet. Signed-out Lumen login and password recovery follow the browser's supported locale in French and Arabic. TV Request Settings reuses SeerrNG translations for its policy, review queue, and Episode Queue controls. Plex linking is covered across four browser projects, checking the Plex PIN exchange, user-specific link endpoint, refreshed linked identity, and absence of the Plex login endpoint. The public `/login/plex/loading` completion callback is now directly reachable and closes only when its completion marker is present. | Finish remaining per-route failure recovery and role/state matrices; verify live authorization and provider persistence/readback, and complete native-matched visuals.                                                                                                                                                                                                             |
| Instance administration    | `/setup`, `/settings/*`                                                         | Lumen includes setup and dedicated administration pages for general/network settings, users, libraries, services, jobs, logs, notifications, metadata/discovery, categories, indexers, migration, and integrations. Native administrator `/settings/*` bookmarks now redirect to their Lumen destinations while preserving query and fragment state; administrator route checks remain authoritative. Every direct `/admin` route denies a standard user on the bundled `/lumen/` deployment across desktop, iPhone, Android, and tablet. Lumen settings controls, storage guidance, save/upload feedback, and Discover row headings/labels follow English, French, and Arabic. Scheduled Jobs uses SeerrNG's localized job-name catalog keyed by the stable job ID and now verifies the persisted cron schedule before closing its editor, retaining the draft and offering retry feedback on mismatched readback. Servarr service forms now compare create/update results with fresh provider-settings reads and confirm deletion before closing. Failed or stale confirmations retain the editor and draft; retries verify whether the service remains before attempting another deletion, and create retries target the assigned service ID instead of creating a duplicate. Request Override Rules now verify create/update readback before closing, retain the draft after a stale read, and retry a created rule by its assigned ID. Rule deletion keeps its confirmation open until a fresh list confirms the rule is absent. The About screen includes SeerrNG support and TMDB logo attribution links.                                                                                                                                                                                                                                                                                                              | Audit each route's validation, dirty-state, save/readback and failed-save recovery against native behavior; finish remaining provider coverage and native-matched/bundled acceptance.                                                                                                                                                                                              |

### Music artist release groups

Artist detail now groups releases by MusicBrainz secondary type before primary
type, matching native SeerrNG. The page displays all supported release groups
including Live, Compilation, Remix, Soundtrack, Broadcast, Demo, and Other;
release counts come from the existing artist API response. Groups above 20
releases load the complete group through the existing bounded artist endpoint,
up to its 1,000-item page-size cap, and can collapse back to the initial list.
The Show All/Show Less controls and release-type labels are localized in
English, French, and Arabic. Existing cards, artwork, watchlist actions, and
authorization gates remain in place.

The fixture test verifies secondary-type grouping, counts, full-group API query,
expansion, and collapse affordance across desktop, iPhone, Android, and tablet.
The native matched visual comparison remains unverified because the isolated
Next test server does not provide the API data used during server-side page
rendering; Lumen-only screenshots do not establish visual parity.

### Music album contributing artists

Lumen album details now expose the primary album artist and unique track
artists in a closed-by-default disclosure, with each entry linking to that
artist's Lumen detail page. It uses the existing SeerrNG album response's
MusicBrainz IDs, preserves the album-artist role when the same person also
performs on a track, and localizes the disclosure and role labels in English,
French, and Arabic.

Fixture coverage checks default-collapsed behavior, primary and track artist
links, duplicate removal, and all three locales. The disclosure reuses the
existing `adv`, `toolbar`, and `chip` styles; a native matched visual comparison
for the wider album detail remains unverified. The standalone fixture passes 12
cases across desktop, iPhone, Android, and tablet in English, French, and
Arabic. The bundled production mount passes at desktop and phone sizes. Open and
closed Lumen captures were inspected at desktop and phone sizes and are retained
at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-music-artists-20261123/`.

### Lumen French and Arabic catalog completion

The Lumen paths for Request History, Admin Notifications loading feedback, linked
identity providers, and the Account navigation's Client Tokens entry now have
French and Arabic translations. A focused catalog test covers these actual Lumen
consumers and rejects accidental English fallbacks. This closes those four
catalog gaps only; it does not establish complete localization coverage for all
routes or acceptance of every translated screen at every viewport. Candidate
captures cover desktop and phone layouts and their browser checks report no
horizontal overflow. The existing Request History baseline-capture mode is not
a valid baseline for this comparison: it expects English status copy although
the committed baseline already renders that text in the selected locale. Native
matched visual acceptance therefore remains open.

### Game Finder and My Games navigation parity

Native SeerrNG exposes Game Finder and the personal Games library as separate
navigation destinations. Lumen previously exposed Games in its global menu and
required users to open that page before finding either destination. Lumen now
places a localized Game Finder entry beside Games when the PC game catalog is
available to the account and the user has request access, and a localized My
Games entry in the personal library section whenever game categories are enabled.
My Games remains available without software-request permission and for households
with only console game catalogs enabled; both entries disappear when game
categories are disabled.

Browser fixtures verify direct navigation, the permission and catalog gates,
and French, Arabic, and English labels across desktop, phone, Android, and tablet
viewports. A compact 320-pixel phone case confirms the Finder entry remains
reachable without horizontal overflow. Matched desktop and iPhone sidebar
captures show My Games in the personal library section; evidence is retained in
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-indexer-state-guidance-20261123/my-games-nav/`.
The standalone Lumen build and 28-case navigation suite pass (25 passed, 3
project-specific skips). Fixtures do not verify live QuestarrNG catalog results
or production-server mount behavior.

### Native Discover bookmark compatibility

Native SeerrNG emits direct links for movie and TV genres, studios, networks,
keywords, languages, upcoming titles, curated lists, and catalog destinations.
Lumen now translates these native `/discover/*` page URLs to its equivalent
catalog routes, carrying filters, paging, query, and hash state through the
redirect. Genre, studio, and network IDs and language codes are validated before
they become Lumen filter values; malformed IDs safely return to Discover.
Optional catalog routes still pass through their existing Lumen authorization
and availability gates after redirection.

The route-bookmark suite now passes 34 cases across desktop, iPhone, Android,
and tablet (136 runs total). It covers each supported native Discover
destination, query/hash preservation, malformed identifiers, Coming Soon, and
the native user-list route with manager and standard-user permissions.
This covers route compatibility and does not substitute for production-mounted
server acceptance or visual comparison of the destination pages.

The native `/coming-soon` bookmark also redirects to Lumen's `/soon` route while
preserving query and fragment state. The native `/users` list bookmark now
redirects to Lumen's `/admin/users`, where its existing manager permission gate
still applies; an unauthorized user is sent to `/me`. Both redirects preserve
URL state where authorized.

### Native user profile route compatibility

Native SeerrNG user-profile links now resolve inside Lumen: `/users/:id` opens
the household profile, `/users/:id/requests` opens that user's filtered request
history, `/users/:id/watchlist` opens the delegated Watchlist, and
`/users/:id/settings/*` maps to the signed-in account screen or the corresponding
managed-user panel. Native `/profile`, `/profile/watchlist`,
`/profile/advanced-theme`, and `/profile/settings/*` bookmarks map to the Lumen
profile, Watchlist, and account sections. Request filters and query parameters
survive redirects, and the path user ID takes precedence over a conflicting
legacy `userId` query. Malformed IDs fall back to safe Lumen destinations.
Managed-user settings require administrator or user-manager permission;
unauthorized viewers return to their own profile without loading target settings.

Twenty-eight browser cases pass in each standalone and bundled `/lumen/` build
across desktop, iPhone, Android, and tablet. They cover profile/watchlist
destinations, request filter preservation, self-settings and notification-channel
routing, manager panel routing, and unauthorized no-read behavior. These mocks
verify route mapping and client-side gates; server authorization remains
authoritative and live provider/API behavior is outside this fixture.

### Magazine request sheet parity

The Lumen magazine request sheet now shows the latest issue, current request
eligibility/status, effective magazine service, and approval requirement before
submission. It loads configured magazine services for all requesters, permits
destination choice only to eligible users when multiple services exist, and
blocks submission when no magazine service is configured. Existing request
permissions, selected destination behavior, and request payload are preserved.
The sheet's request feedback and controls follow English, French, and Arabic.

Sixteen browser cases pass across desktop, iPhone, Android, and tablet. They
cover all three locales, default and alternate service selection and submitted
identity, and no-service blocking. Existing magazine request regression cases
are also required for final acceptance. Matched baseline/candidate desktop and
iPhone screenshots show the taller content within the existing sheet surface
and spacing. Fixtures do not verify live magazine provider data or submission;
independent language review remains unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-magazine-request-parity-20261122/`.

### Global Search localization

Global Search now localizes its category scopes, search prompts, sort controls,
recent and trending headings, result sections, empty and failure states, and
pagination in English, French, and Arabic. The same supported query parameters,
provider result grouping, and page navigation remain in place. The failed-search
panel uses localized title and Retry labels.

TMDB collections are included in the unified search response and rendered in a
localized Collections section linking to the collection detail route. A focused
browser regression now checks collection visibility, detail links, and hiding
when the movie category is unavailable in English, French, and Arabic across
desktop, iPhone, Android, and tablet. This verifies the existing UI contract;
provider responses and live TMDB behavior remain covered separately by the
native API checks.

The browser fixture passes 12 cases per deployment across desktop, iPhone,
Android, and tablet (English, French, and Arabic); standalone production and the
bundled `/lumen/` mount both pass. English baseline/candidate captures match
pixel-for-pixel at desktop and iPhone sizes. French desktop and Arabic iPhone
were inspected, with no page-level horizontal overflow. Search API behavior,
live provider catalogs, and independent linguistic review remain unverified.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-search-localization-20261121/`.

### Lumen administrator settings localization

The Lumen-specific administrator settings screen now localizes its own
headings, settings labels, descriptions, options, storage guidance, recovery
actions, upload/save controls, and completion feedback in English, French, and
Arabic. The existing request policy component remains embedded in the page and
continues to use its existing SeerrNG message translations. Settings values,
file format, permission checks, save endpoint, and upload behavior are
unchanged.

Twelve standalone and twelve bundled `/lumen/` browser cases pass over desktop,
iPhone, Android, and tablet. They verify translated labels, no horizontal
overflow, draft editing, and the existing save payload and success feedback.
English baseline/candidate screenshots match pixel-for-pixel at 1440 CSS px
and 390 CSS px. French desktop and Arabic iPhone were inspected. Live storage
permissions, actual file saves/uploads, and independent linguistic review
remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-settings-localization-20261121/`.

### Built-in account theme presets

Lumen Account Settings now exposes SeerrNG's shared built-in advanced-theme
preset picker. Applying a preset uses the same definition as native SeerrNG,
saves its values through the authenticated per-user settings route, and keeps
saved and currently edited token overrides as higher-priority values. English,
French, and Arabic controls are included. Users can also clear every saved
override in one confirmed action. These actions affect only the signed-in user's
settings.

All 72 Account Settings browser cases pass across desktop, iPhone, Android, and
tablet. Six focused preset, reset, and theme-color cases pass on the actual
bundled `/lumen/` Express mount across desktop and iPhone. The Lumen production
TypeScript/Vite build passes. These behaviors are fixture-tested. A live
authenticated save against a production SeerrNG instance remains unverified.
Matched baseline/candidate screenshots are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-theme-presets-20261122/`.

The native Advanced Theme settings route is ADMIN-only. Lumen now applies the
same gate to the Account toolbar link and editor; regular accounts do not load
their theme editor endpoint. Theme preset and override persistence remains
available to administrators. A focused role-gate browser fixture covers the
regular-account bookmark and no-read behavior; administrator persistence
fixtures use the ADMIN permission bit. Matched visual acceptance for the
permission change compared the prior account bookmark capture with the new
viewer account at the same `/me/account#advanced-theme` route, at 1440-pixel
desktop and 390-pixel iPhone widths. The viewer now remains at Account Settings
without the unauthorized section; candidate captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-theme-admin-gate-20261124/`.

### Account language choices

The account's preferred media-language selectors now display API language
codes in the saved interface locale and sort by those localized names. Their
option values remain the same ISO language codes used by SeerrNG. This affects
the global, movie, series, music, and book preferences without changing their
save payload.

The browser fixture verifies localized English, French, and Arabic language
names and unchanged option values over desktop, iPhone, Android, and tablet in
standalone and bundled deployments (12 cases per deployment). French baseline
and candidate full-page captures match in size at 1440 and 390 CSS pixels; the
only changed pixels are the selected language label. French iPhone and Arabic
desktop renders were inspected, with no page-level horizontal overflow. The
fixture uses a small mocked language list; live catalog coverage and
independent linguistic review remain open. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-account-language-options-20261121/`.

### Per-user default request folders

Lumen Account Settings now exposes the native per-service default request
folder preference for users with administrator, request-management, or advanced
request permission. It loads configured Radarr, Sonarr, Lidarr, Readarr and
Kapowarr destinations, preserves a saved path when a service no longer offers
it, permits returning to the service default, and verifies every save by
reading the persisted folder map back. Provider calls are bounded in batches of
five; partial service failures remain visible and retryable. The existing
authenticated user-settings API remains authoritative for validation and
persistence.

The focused browser workflow passes in English, French, and Arabic on desktop,
iPhone, Android and tablet (12 cases). It verifies the permission gate, service
folder options, exact save payload, persisted readback and page overflow.
Matched English baseline/candidate Account Settings captures were inspected at
desktop and phone sizes; the new section follows the existing settings card and
form controls. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-folders-20261122/`.
Live Servarr/Kapowarr calls and independent translation review remain
unverified.

### Network settings persisted readback

Lumen's Network Settings save now verifies every changed field in both the
write response and a fresh read from `/settings/network`. If either response
does not contain the requested value, the page reports a localized recovery
message and keeps the edited draft enabled for retry. A verified save refreshes
the form from persisted settings. Proxy-password clearing is included in the
same check without exposing the saved password.

The focused Network Settings browser suite passes across desktop, iPhone,
Android, and tablet (32 cases). It covers a rejected write, a successful write
with stale persisted readback, retry after persistence recovers, numeric unit
conversion, DNS settings, and TLS settings. Matched full-page baseline and
candidate failure states were inspected on desktop and iPhone; the form,
spacing, and navigation geometry are unchanged, and the new alert uses the
existing failure treatment. The production Lumen build passes. Fixtures do not
verify live database persistence, proxy secret handling, or listener restart
behavior. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-network-settings-readback-20261122/`.

### General application settings persisted readback

General Settings now confirms each edited value in a fresh read of
`/settings/main` after its write response. A stale or mismatched readback keeps
the user's draft intact, reports the existing localized confirmation failure,
and leaves Save available for retry. Public settings caches are invalidated
only after persistence is confirmed.

The focused browser cases pass on desktop, iPhone, Android, and tablet. They
cover a rejected write and recovery, a successful write with stale persisted
readback and retry, plus the existing sparse-save and reload behavior. Matched
full-page captures at 1440 CSS px and iPhone 13 width show the same form and
navigation geometry as the prior write-failure state; only the localized
failure text differs. The production Lumen build passes. Fixture persistence
does not verify a live SeerrNG database or dependent login behavior. Evidence
is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-general-settings-readback-20261122/`.

### Administrator settings persisted readback

Lumen now confirms administrator category switches, Age Gate settings,
metadata provider settings, and saved connection hosts through a fresh read
after a successful write. Category, Age Gate, and metadata saves compare the
persisted values with the write response; host saves compare the canonical
server response with the readback.
When a readback is stale or disagrees, each form keeps its draft and offers a
retry. Category cache invalidation happens only after confirmation. New
confirmation messages for metadata and connection hosts follow English,
French, and Arabic locales.

Twenty focused browser cases pass across desktop, iPhone, Android, and tablet.
They cover stale readback and retry plus neighboring category, Age Gate,
metadata provider-test, host-validation, and write-failure recovery behavior.
Matched failure/recovery captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-settings-readback-20261122/`.
Desktop and phone states were inspected for alert placement, form retention,
navigation clearance, and overflow. Production build passes; these fixtures do
not verify live settings persistence or provider connections.

### Request policy and discovery credential persisted readback

Instance Request Settings now verifies changed policy flags in a fresh
`/settings/main` read after the write response. Discovery Integrations reads
its public configuration projection back after saving and confirms changed
client IDs and provider configured state; API keys and secrets stay write-only
and are never compared or exposed. A stale readback keeps the user's edits and
save action available for retry. Public settings caches are invalidated only
after a confirmed policy save.

Eight focused browser cases pass across desktop, iPhone, Android, and tablet
for write rejection, stale readback, and retry. Discovery's localized recovery
flow passes in English, French, and Arabic across the same four viewports.
Matched failure/recovery captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-policy-readback-20261122/`.
The inspected desktop request-policy and phone Discovery states retain the
existing controls and navigation geometry. Fixtures do not verify a live
SeerrNG settings store or secret persistence.

### Audiobookshelf and Kavita connection persisted readback

Lumen's Audiobookshelf and Kavita connection forms now confirm a successful
save through fresh redacted settings readback before clearing the draft. The
submitted public fields must match the write response, the readback must match
that response, and the API key must remain redacted. Disconnect also confirms
the persisted connection is `null` before reporting success. Stale reads retain
the edited fields and allow a retry.

Eight connection cases pass across desktop, iPhone, Android, and tablet,
covering rejected writes, stale readback, retry, and secret redaction. Eight
localization/lifecycle cases pass per locale in English, French, and Arabic
across the same viewports. The mobile save action was inspected after scrolling
in the actual viewport and remains clear of the fixed tab bar; full-page and
scrolled viewport captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-reader-settings-readback-20261122/`.
Fixtures do not verify live Audiobookshelf or Kavita settings storage or
provider connections.

### Per-user external request lists

Lumen Account Settings now exposes SeerrNG's authenticated external request list
workflow: public IMDb and Goodreads URLs, Hardcover token validation and shelf
replacement, manual sync, IMDb CSV import in bounded batches, last-sync feedback,
and list removal. These actions continue to pass through the existing SeerrNG
request permissions, approval rules, and daily synchronization job. English,
French, and Arabic labels are supplied; provider errors remain visible for
recovery.

The focused browser fixture passes on desktop, iPhone, Android, and tablet. It
checks URL and Hardcover payloads, sync summary, CSV identity, removal, and page
overflow. Matched candidate captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-external-lists-20261122/`.
Live provider behavior and independent translation review remain unverified.

### Per-user book and audiobook Discover sections

Lumen Account Settings now includes the native personal book-home section
controls. Users can add and remove popular, new, and genre shelves for ebooks
and audiobooks, toggle visibility, reorder shelves, and save through the
authenticated per-user settings route. The component reads the saved order
back after saving and preserves edits when the write or readback fails. All
option labels and actions have English, French, and Arabic translations. Lumen
Discover now reads those saved choices and renders enabled shelves in the saved
order. Ebook rows use the existing catalog and card actions; audiobook rows use
ReadMeABook's existing discover and request routes, including request status.
Catalog requests wait until each shelf approaches the viewport.

The focused browser fixture verifies adding a shelf, moving it, hiding it,
checking the exact persisted payload, and page overflow across desktop, iPhone,
Android, and tablet. A separate Discover fixture checks shelf order, ebook
queries, ReadMeABook request identity, updated request state, and overflow in
the same viewport matrix. Account and Discover captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-external-lists-20261122/`.
Live provider responses and independent translation review remain unverified.

### Book Recommendations localization

The Hardcover Book Recommendations route now localizes its feed headings and
actions, source and like counts, recommendation filters, ebook/audiobook
choices, create-feed fields, empty and unavailable states, and recovery and
success feedback in English, French, and Arabic. Provider-authored feed and
book metadata stays as supplied. Existing filter values, URL selection,
Hardcover request bodies, and book resolution destinations are unchanged.

The focused fixture passes 12 cases across desktop, iPhone, Android, and tablet
and checks page-level horizontal overflow. Matched baseline/candidate captures
were generated at 1440px desktop and iPhone 13 sizes; French iPhone and Arabic
desktop candidates were inspected. Longer translated copy wraps within the
existing components, and the sticky mobile navigation overlaps lower form
content in both baseline and candidate. Live Hardcover responses and
independent linguistic review remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-book-recommendations-localization-20261122/`.

### Comic and manga detail localization

Comic and manga detail pages now localize edition selection, recommendation
markers, request and reader actions, issue/volume lists, metadata labels and
statuses, and lookup/request recovery text in English, French, and Arabic.
Provider-supplied edition names, publishers, descriptions, genre values, and
issue titles remain unchanged. Existing selection, permission checks, request
payloads, and reader destinations are preserved.

The full Comics/Manga browser suite passes 96 cases with 28 existing
viewport/interaction skips. The added locale matrix covers 12 locale/device
cases and asserts no horizontal overflow. Matched source/candidate screenshots
were captured for English/French/Arabic at desktop and iPhone sizes; French
iPhone and Arabic desktop were inspected. Lumen-owned labels and facts follow
the account locale, while embedded controls from their own shared components
and provider metadata retain their existing owners. Live ComicVine/reader
responses and independent language review remain unverified. Evidence is
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-comic-detail-localization-20261122/`.

### Magazine discovery and detail localization

Magazine browse and detail screens now localize tracked/public catalogue
controls, search guidance, suggested-search accessibility text, request
actions, empty states, issue counts, detail facts, and issue availability in
English, French, and Arabic. Suggested magazine names and provider-owned issue
data remain unchanged. Saved catalogue mode, search query, and request flow are
preserved.

The Comic/Magazine browser suite passes 108 cases with 28 existing
viewport/interaction skips. Twelve new locale/device cases verify public
catalogue search, empty feedback, request action copy, and no horizontal page
overflow. Matched baseline/candidate screenshots were captured at iPhone and
desktop sizes; French iPhone and Arabic desktop were inspected. Live Google
Books/LazyLibrarian results, magazine request submission, and independent
linguistic review remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-magazine-localization-20261122/`.

### Account-synced Lumen preferences

Theme, Discover shelf visibility, and personal request/display choices now load
from and save to the signed-in user's SeerrNG settings. Existing browser copies
are used only to migrate preferences from older Lumen versions and remain a
local mirror. Server values override that copy on other devices. Administrator
defaults and locks remain authoritative. The settings endpoint validates the
supported fields and rows, and clearing preferences restores administrator
defaults. Save and load failures remain visible with a retry action.

Route and migration tests pass for validation, authenticated persistence,
readback, reset, and upgrade-safe schema changes. Browser fixtures pass across
desktop, iPhone, Android, and tablet for server precedence, admin locks,
reload, reset, failed-save retry, and account readback from a separate browser
profile with stale local preferences. Sixteen cases passed against standalone
production and sixteen against the production Express `/lumen/` mount. These
fixtures do not replace live multi-device verification against a running
SeerrNG instance, which remains open.

### TV detail actions, seasons, and facts

TV detail now localizes the season heading and list accessibility name, request-selection CTA, whole-show guidance, selection shortcuts, premiere and episode labels, common lifecycle statuses, fact headings, related-title navigation, streaming-policy controls, and the Series Collections disclosure and empty/loading copy in English, French, and Arabic. Unknown provider status values and season names remain intact. Selection state, authorization, season mapping, request payloads, and collection lookup are unchanged.

The combined Movie/TV fixture suite passes 24 cases across English, French, and Arabic on desktop, iPhone, Android, and tablet. It verifies localized movie actions and facts, TV season-selection transitions, request-label updates, lifecycle status, collection empty state, saved locale, and no horizontal page overflow. French desktop and Arabic phone captures were inspected. The matching pre-change comparison and bundled production mount remain unverified; live provider/collection behavior and the independent TV request mutation flow need separate qualification. Evidence: `/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-option-translation-20261121/`.

### Movie detail actions and facts

Movie detail now localizes its primary request and 4K actions, theater and 4K playback copy, fact labels, related-title links, and streaming-policy confirmation controls in English, French, and Arabic. Provider values, server names, certification, release-kind names, and media status values remain data-driven. Request authorization and submission behavior are unchanged.

The detail browser fixture passes in all three locales on desktop, iPhone, Android, and tablet (12 cases). It checks the request action, original-language/runtime fact labels, shared request options and disclosures, tag toggling, saved locale, and page overflow. French desktop and Arabic phone captures were inspected. A matched pre-change comparison, bundled production mount, and a TV-detail-specific localization matrix remain unverified; dynamic provider values and live request behavior are not covered. Evidence: `/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-options-20261121/movie-detail/`.

### Movie and TV request option localization

The shared request-options disclosure on movie and TV detail pages now localizes its title, loading and no-server copy, requester, server, quality profile, folder, language and season-order controls, default labels, quota override, and request tags in English, French, and Arabic. Shared cast/crew and subject-tag disclosures also localize their headings, expand/collapse actions, browse controls, saved-open buttons, and preference-failure feedback; trailer actions use the active locale. Server names, quality profile names, folders, metadata values, permission checks, and request payloads remain supplied by their existing owners.

The fixture-driven movie detail check passes in English, French, and Arabic on desktop, iPhone, Android, and tablet (12 cases); it verifies the saved locale, request-option labels, cast expansion, tag visibility toggling, and no horizontal page overflow. Matching candidate captures at 1440 CSS pixels (French) and 390 CSS pixels (Arabic) were inspected. A matched pre-change screenshot comparison and the companion production mount remain unverified; fixtures do not prove live server behavior or independent linguistic review. Evidence: `/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-options-20261121/`.

### Shared media status labels

The shared poster, request, detail and category status displays now translate
the common library and request states using the signed-in account locale.
This includes server availability, partial availability, shared availability,
queued and downloading progress, request state, blocklist state, and library
counts. The underlying status selection and media-server availability rules
are unchanged.

Status fixtures pass in English, French and Arabic across desktop, iPhone,
Android and tablet. Baseline/candidate captures for the same account, title and
viewport confirm unchanged geometry and no horizontal overflow; Arabic keeps
RTL direction. Live provider states and independent linguistic review remain
open. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-admin-users-localization-20261120/status-localization/`.

### Watchlist display localization

Lumen Watchlist, Discover Watchlist, and delegated user-watchlist screens now
localize their headings, filters, media and sort choices, pagination, removal
actions, empty/loading copy, and generic removal failures in English, French,
and Arabic. Arabic retains RTL direction. Filtering, ownership, safe removal,
and combined Plex/SeerrNG list behavior are unchanged. Browser fixtures pass for
the populated list and a failed removal across desktop, iPhone, Android, and
tablet; 36 existing Watchlist regression cases pass across the same viewports.
English, French, and Arabic baseline/candidate captures were compared at 1440
and 390 CSS pixels; geometry is unchanged and the Arabic screen has no
horizontal overflow. Other Lumen locales use the English fallback, and live
provider and independent linguistic review remain open. Evidence is retained
at `/mnt/disks/scratch/task-deliverables/seerrng-admin-users-localization-20261120/watchlist-localization/`.

### User administration display

The Lumen user directory now localizes its heading, search and sorting controls,
account roles, request counts, management actions, pagination, delete
confirmation, local-account creation, and basic profile editing in English,
French, and Arabic. Failed local-account creation retains the entered values
for retry. Directory and profile load failures use the active locale's shared
error messages.

Twelve standalone and twelve bundled-asset `/lumen/` browser cases passed over
all four viewport projects. They cover the directory, account creation, failed
submit and retry, and overflow. Twelve existing create/profile regression
cases also passed. Matching French and Arabic baseline/candidate captures of
`/admin/users` and the local-account form were inspected at 1440 × 900 and
390 × 844; existing list and form geometry remains, with longer labels wrapping
inside the same row layout. Live directory, provider import, and linked-account
verification against an actual SeerrNG instance remain open.
Evidence is retained at
`seerrng-admin-users-localization-20261120`.

Managed per-user Episode Queue defaults and TV request-access state now also
follow the saved English, French, or Arabic locale. This covers load and save
feedback, the confirmation sheet, request-access status, and review and refresh
actions without changing the settings API, authorization, or save behavior.
The expanded directory fixtures verify the selected queue value,
confirmation/cancel path, access status, and RTL direction across desktop,
iPhone, Android, and tablet. Twelve standalone production cases passed;
French and Arabic baselines and candidates were compared at 1440 × 900 and
390 × 844. Longer labels wrap within the existing user row. The sticky mobile
navigation continues to cover part of the tall row as it did before. Evidence is
retained at `seerrng-admin-users-localization-20261120/baseline-panels-*` and
`seerrng-admin-users-localization-20261120/candidate-*`.

Managed local passwords, one-time sign-in links, maturity limits, media
categories, and request quotas now use the same locale. Their fixtures exercise
password mismatch and failed-save retry, one-time link creation and revocation,
category persistence, maturity-limit persistence, and quota validation and
save. Twelve standalone and twelve bundled `/lumen/` cases passed across
desktop, iPhone, Android, and tablet. French and Arabic baseline/candidate
states for categories, maturity,
and quotas were inspected at 1440 × 900 and 390 × 844. Longer labels wrap
within the existing controls. The shared mobile navigation now yields after a
user expands a panel if the bar would cover an action, while keeping its
initial visibility and normal scroll-direction behavior. Evidence is retained at
`seerrng-admin-users-localization-20261120/admin-settings-*`.

Media-server user import and linked-account management now also follow the
saved locale. Fixtures verify synchronized user import selection, failed import
retry, successful import, unlink confirmation and cancel, failed unlink retry,
and successful unlink. Twelve standalone and twelve bundled `/lumen/` cases
passed across desktop, iPhone, Android, and tablet. French and Arabic
baseline/candidate renders were inspected at 1440 × 900 and 390 × 844; the
existing user-row layout wraps longer labels without horizontal overflow.
Actual provider import and unlink effects remain unverified against a live
SeerrNG instance. The user notification settings panel reuses the separate
Notification Settings route. That route was localized in `1eea80e33` and has
English, French, and Arabic coverage for channel preferences, public-key save
and removal, Telegram settings, browser-device removal, RTL direction, and
overflow across desktop, iPhone, Android, and tablet. The French and Arabic
four-viewport cases were rerun against the current standalone build and passed
8/8. The delegated notification panel uses the same forms. The separate
administrator notification page still has English-only channel forms and
headings; localizing those controls remains open. Evidence is retained at
`seerrng-admin-users-localization-20261120/managed-account-*` and in
`user-notifications-localization.spec.ts`.

Shared notification event selectors on the administration and user notification
pages now use SeerrNG's localized English, French, and Arabic event labels. The
administrator notification page now localizes its shell, channel forms,
provider-specific fields and options, validation and feedback, and recoverable
load failures. It uses SeerrNG's message catalog for native channel copy and
Lumen translations for channel actions and recovery controls in English,
French, and Arabic. English channel settings, save/test behavior, and
independent event masks pass at desktop, iPhone, Android, and tablet sizes.
French and Arabic provider-label and form checks pass, as do recoverable
load-error/retry checks in all three locales across all four viewports. The
tests cover every channel's provider labels and verify a failed email-settings
request recovers through Retry without looping or losing the form. Existing
form geometry and no-horizontal-overflow checks pass; the fixed mobile
navigation still overlaps part of the tall configuration page. Actual provider
save/readback and delivery remain unverified against a live SeerrNG instance.
The focused admin notifications browser suite is in
`lumen/tests/browser/admin-notifications.spec.ts`. Visual captures are retained
at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-notifications-20261121/`;
the English baseline and French/Arabic candidate renders were compared at 1440,
834, 412, and 390 CSS pixels.

The shared mobile tab bar now yields while users scroll down through long pages,
so it no longer covers form actions or search controls. It returns on upward
scroll, at the top or page end, and remains available while keyboard focus is
inside it. The existing bar geometry and initial state are unchanged. Browser
fixtures passed on iPhone, Android, and tablet; desktop skipped because it has no
mobile tab bar. Baseline and candidate `/admin/users` Create Local User screens
were compared at 390, 412, and 834 CSS pixels, with initial-state geometry
unchanged; the hidden-on-scroll state was inspected at 390 and 834. Evidence is
retained in `seerrng-lumen-mobile-navigation-20261121/baseline/`,
`candidate/admin-users-*`, and `candidate/results-rerun/`. The shared behavior
also passes on a long My Media screen across the same mobile projects; visible
and hidden iPhone and tablet renders were inspected after the CSS transition
completed. Those captures are in `candidate/library/`.

Request lifecycle status is already implemented and no longer an open Lumen
gap. Lumen opts into SeerrNG's owner-scoped status projection for request
progress and lifecycle filters, then uses the requested book format to select
ebook or audiobook status and download data. Legacy fallback is limited to
older backends that reject the projection; outages and malformed projected
responses do not downgrade to coarse status. The server projection shipped in
`28d8abd9c`. The current `request-status.spec.ts` suite passes 96 cases across
desktop, iPhone, Android, and tablet, including missing-audiobook versus
available-ebook, authoritative Available membership, format-specific downloads,
TV season selection, cancellation, and approval. Other request-audit items in
the table remain open.

Request ownership and delegated-action fixtures were extended and qualified
in standalone and bundled deployments. Across `request-status.spec.ts`,
`request-retry-coverage.spec.ts`, and `requests-pages.spec.ts`, 164 browser
cases pass per deployment on desktop, iPhone, Android, and tablet. They verify
that personal viewers see only their own requests, read-only request viewers
can inspect but not act on household requests, managers can moderate another
user's focused request, owners can cancel their pending request, retries
respect ownership and category permission, and management-only mapping and
managed-copy actions stay restricted. The Requests-page fixture now handles
the production `/lumen/` API prefix and routes. This closes fixture coverage of
those role edges; it does not prove live server authorization or provider
effects.

Managers can now recover failed TV requests with `tvdb_id_unresolved` or
`tvdb_season_mismatch` by selecting the exact Sonarr series and mapping every
active requested TMDB season to a unique TVDB or Sonarr-order season. Lumen
uses SeerrNG's existing lookup and official-season endpoints, then submits the
same strict mapping payload to the existing retry endpoint; server permission,
request-state, service and mapping validation remain authoritative. The action
is hidden for non-managers and unsupported failures. Browser fixtures verify
the manager flow, exact payload, and non-manager visibility across desktop,
iPhone, Android and tablet. Live Sonarr/TVDB responses and visual comparison
against native SeerrNG remain open.

Request managers can also remove an eligible managed copy from its configured
service without deleting its SeerrNG request or history. Lumen shows this
separately from deleting the request, only when SeerrNG returns `canRemove`,
and requires a confirmation that states the request will remain. The action
uses the existing `/media/:id/file` route and preserves 4K and book-format
scope. Browser fixtures verify the confirmation boundary, exact removal route,
and continued request row. The expanded matrix also checks exact `is4k=true`
video scope and `audiobook`, `both`, ebook-only, and audiobook-only book
queries. Fixtures mirror `canRemove` on ordinary manager rows and the separate
status wrapper used by timeline filters. All 40 retry, mapping, and removal
cases pass across desktop, iPhone, Android, and tablet. Live service removal
remains unverified; native
visual comparison is still open. The shared confirmation owner was compared
before and after at desktop (1440 × 900) and iPhone (390 × 844) with the same
request and dialog state. The previous `.pk-head` grid squeezed the title and
body into a narrow column; the shared full-width header restores readable line
wrapping and keeps both confirmation actions visible. The checked consumer was
the managed-copy confirmation; other `ConfirmSheet` consumers remain outside
this visual comparison. Captures are retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-tvdb-mapping-20261121/`.

The native TV request dialog now retries season metadata that fails during the
parallel provider pass, one missing season at a time. This handles providers
that reject concurrent season lookups while keeping the work bounded by the
requested season count and preserving the user's selection until every season
is available. A 15-season API fixture forces concurrency failures and verifies
that the serial recovery returns all seasons; route and request-tree fixtures
pass. The native full-app Playwright workflow also passes for a 13-season
series at 390 and 1440 CSS pixels: a partial first batch recovers the missing
seasons, the user selects an episode, and the submitted request retains the
exact season and episode. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-parity-20261121/native-large-series/`.
This fixture proves the partial-response and request-selection path, not the
live provider outage shown in the user's screenshot. Live-provider confirmation
remains open. Lumen now separately verifies the series-selection counterpart:
a 15-season series exposes all seasons, deep-links to season 15, selects all
seasons, and submits the exact whole-series payload. The same browser suite
also verifies failed episode metadata can be retried without losing the
deep-linked episode. The 64-case TV request-state suite passes in standalone
Lumen and the Express `/lumen/` mount across desktop, iPhone, Android, and
tablet. These fixture cases close the selection and retry coverage gap; live
provider behavior and native-matched visual acceptance remain open.

Season details with an empty but valid `episodes` array now count as loaded
metadata instead of being dropped and retried as failed. This prevents a
zero-episode season from leaving the entire request tree in the red load-error
state. The server route test verifies that it preserves the empty season, and
the request-tree test verifies that this response completes loading without
changing selections. Both focused suites pass, including the 29-season batching
case. Actual provider responses remain to be confirmed in a live instance.

Discover previously issued its default-on catalog requests before the
asynchronous Lumen configuration loaded, even when an administrator had disabled
every home row. It now waits for that configuration before rendering optional
chips/shelves or fetching row data. Standalone fixtures verify the seven
disabled rows remain absent while the enabled Popular row loads, with no
requests for disabled catalogs, on desktop, iPhone, Android and tablet.
Per-category provider, filter, pagination, saved-settings,
live-provider and native-matched visual acceptance remain open.

The six optional catalog entries (Music, Comics/Manga, Magazines, Games,
Sports and Adult) also remain reachable from the desktop sidebar and narrow
Discover chips when both the global and per-user categories are enabled and
their providers answer. Four browser cases verify exact destinations and no
horizontal overflow at desktop, iPhone, Android and tablet widths. Live
provider content and native-matched visuals remain open.

These optional desktop links and Discover chips now use locale message IDs
instead of the English labels stored in the catalog metadata. English, French,
and Arabic fixtures verify all six translated labels and their destinations at
desktop, iPhone, Android, and tablet widths. The same native link and chip
owners remain in place; candidate renders were checked against English-label
baselines with no clipping or horizontal overflow. Independent linguistic
review and full-production-mount verification remain open.

Discover's remaining visible shell copy now uses the account locale, including
the search prompt, quick links, shelf headings, section links, empty and failed
states, retry actions, recent-media dates, and the shared card title-view
control. The shared title control is also checked on Movies, a second consumer.
English, French, and Arabic browser fixtures cover success, empty, failure,
retry, dates, and both title-control states at desktop, iPhone, Android, and
tablet sizes against standalone production and the Express `/lumen/` mount.
Matched baseline/candidate captures show unchanged geometry and no new clipping
or overflow. This is fixture-based UI evidence; provider results and independent
linguistic review remain open. Evidence is retained at
`seerrng-lumen-discover-localization-20261121` in task scratch.

The administrator's Lumen settings page now uses the same translated Discover
row labels as personal settings. English, French, and Arabic standalone and
bundled browser cases pass on desktop, iPhone, Android, and tablet. Matched
before/after captures show the same layout and no clipping from translated row
labels; broader settings-page localization and visual review remain open.

The Trending route now translates its title, media and time-window filters,
empty/error states, retry action, and pagination label. English, French, and
Arabic standalone and bundled fixtures verify failure recovery and that the
selected movie/week filters reach the API on desktop, iPhone, Android, and
tablet. Baseline and candidate captures at matching states show no new
clipping; deeper pagination and provider-result parity remain open. Evidence
is retained in task scratch at
`seerrng-lumen-discover-localization-20261121`.

## Delivery and verification

1. Start with household library workflows. Add the feed and saved-item screens
   through existing API contracts and put the same authorized destinations
   within reach from desktop and mobile navigation.
2. Extend reachability and category coverage across discovery, calendar,
   requests, issues, and acquisition. Compare behavior with representative
   permission levels and provider response states.
3. Bring account and instance administration into Lumen by sharing existing
   form and permission contracts. Verify setup and independently hosted
   companion behavior before claiming a full replacement.
4. Keep Lumen's existing palette, type, shell, and shared controls. Preserve
   public deep links, keyboard and touch operation, and existing account and
   instance settings. Check narrow and wide layouts through the actual app.
5. Confirm parity per workflow with real route entry, loading, empty, error and
   populated states, and authorized interactions against isolated fixtures.
   Include direct-link denial for unauthorized actions and both deployments.
   Track retired gaps here with the version and evidence that closed them.

### Lumen localization gap

Native SeerrNG persists the user's selected interface locale and ships a
generated 38-locale registry with names, direction, fallback metadata, and
message catalogs. Lumen currently has no translation runtime and hard-codes
English throughout its routes and shared components. Its account settings also
omit the persisted `locale` field. This is a feature gap: adding a selector
without making Lumen render that locale would falsely imply that the setting
works in the selected interface.

The localization implementation must reuse the existing locale identifiers,
fallbacks, and right-to-left metadata; load the saved locale from the existing
per-user settings endpoint; persist changes through the same endpoint; and
translate Lumen's user-visible navigation, states, forms, errors, and actions.
Use stable message IDs instead of reverse-matching English strings: an initial
source audit found duplicate English catalog values and significant Lumen text
that has no exact native catalog entry. Verify the saved choice after reload,
locale fallback, and right-to-left layout in standalone and bundled Lumen.
Lumen generates a compact locale bundle from SeerrNG's registry and catalogs,
loads and saves the account locale through the existing settings endpoint,
applies document language and direction, and translates the primary shell plus
more of Account Settings: profile fields, preferred media languages, watchlist
controls, password labels, account type and role, streaming subscriptions, and
card title preferences. French save/reload and Arabic RTL are covered in the
account browser suite across desktop, iPhone, Android, and tablet. The actual
production bundle served at `/lumen/` passes the display-language persistence
flow across the same four viewport projects. Desktop baseline/candidate
screenshots were compared at 1440 × 900; English, French, and Arabic phone
screenshots were inspected at 390 × 844. No horizontal overflow appeared.

This is still a partial localization: remaining account actions, notices,
and most other Lumen routes remain English. The twelve theme
color controls now have locale message IDs and human-written French and Arabic
labels, verified in account settings; other locales use the English fallback.
Locale overrides have not received independent human linguistic review, and
full account-suite qualification against the bundled production build remains
open. Evidence: task scratch directory
`seerrng-lumen-localization-visual-20261119`.

Account Settings localization now also covers its TV Request Settings and
return navigation links, plus the account theme override title, guidance,
editing mode, validation feedback, and save confirmation. The desktop sidebar
and mobile tabs now use locale messages for the principal destinations and
section labels, including requests, following, downloads, indexer search,
issues, Blocklist, Swipe, calendar, and watch sessions. French and Arabic
browser assertions cover these labels and updated desktop and phone screenshots
were inspected. The theme color labels were checked at desktop and iPhone widths
in French and Arabic; they preserve the existing settings rows and input
geometry without adding styles. Password forms now translate the save action,
missing-local-password notice, and forbidden/unconfirmed failure messages in
French and Arabic. Browser fixtures cover 403 and 503 responses, including the
first-password state, across all four viewport projects. Permission names now
follow the active locale in Account Settings, Default User Permissions, and
managed user permission editors. Existing SeerrNG permission catalog messages
provide translations; Manage Settings and Vote have explicit English, French,
and Arabic overrides. Browser coverage checks the Account Settings summary in
French and Arabic and both administrator editors in French. It exercises the
account permissions section, expanded default permissions, and an open managed
user permission editor at desktop (1440 × 900), iPhone (390 × 844), Android
(412 × 915), and tablet (834 × 1194) viewports. Baseline and candidate captures
were compared at matching viewports; the existing row and checkbox geometry is
unchanged and Arabic shows no horizontal overflow. Evidence is retained at
`seerrng-lumen-theme-locale-20261120/baseline/permissions/`,
`seerrng-lumen-theme-locale-20261120/baseline/admin-permissions/`, and
`seerrng-lumen-theme-locale-20261120/candidate/permissions/`. Less common
account-screen copy remains English. Locale-specific overrides
are currently human-written only for English, French, and Arabic; independent
linguistic review and full bundled-suite qualification remain open. Candidate
captures from these increments are retained in
`seerrng-lumen-theme-locale-20261120`.

### Navigation entry-point verification

The focused navigation matrix was rerun on desktop, iPhone, Android, and tablet
across `mobile-navigation`, `discover-menu-destinations`,
`optional-catalog-navigation`, `game-finder-navigation`,
`user-management-navigation`, and `admin-navigation`: 140 cases passed and 8
were skipped by explicit viewport guards, using the declared Node 24.22.2
runtime. Coverage includes localized
navigation landmarks and request counts, category and permission filtering,
compact 320 × 568 phone-menu scrolling, optional catalog and Game Finder links,
delegated user management, administrator destinations, and mobile-tab behavior
on long forms and the ordinary-user library.

The checks cover the listed entry points; they do not establish the complete
contextual-route inventory, matched native screenshots for every menu state,
headed verification in the shipped image, or live account authorization. Those
parity checks remain open.

### Standalone request bookmark compatibility (2026-11-23)

The compatibility route `/requests/by-user/:requesterId` now has a Lumen
browser assertion in addition to the `/users/:requesterId/requests` bookmark
check. It verifies that the path requester replaces conflicting query values,
legacy filters are retained in the request-list query, and audiobook format and
search state survive the redirect. The route-compatibility suite passes 32
cases across desktop, iPhone, Android, and tablet on Node 24.22.2. This fixture
checks URL and client-query behavior; live account authorization and the full
contextual-route inventory remain open.

The account profile now localizes save rejection, permission denial, mismatched
server readback, and failed confirmation, plus Plex-managed email, profile and
password loading/retry states, administrator and empty-permission notices, and
media-language failure messages. Generic HTTP load failures use localized
status-specific text while descriptive server messages remain intact. French
and Arabic fixtures cover 403, 503, save mismatch, unreadable readback, Plex
account, missing permissions, and language-service failure states across
desktop (1440 × 900), iPhone (390 × 844), Android (412 × 915), and tablet
(834 × 1194). Matched baseline/candidate captures for French and Arabic at
desktop and iPhone were inspected; translations changed copy only, and the RTL
layout has no horizontal overflow. Evidence is retained at
`seerrng-lumen-theme-locale-20261120/baseline/account/` and
`seerrng-lumen-theme-locale-20261120/candidate/account/`. Remaining less common
account copy and localization outside these audited Lumen surfaces remain open.

The signed-in You hub now localizes its section headings, destinations, theme
choices, request preference controls, Discover rows, reset confirmation,
media-server summary, sign-out action, and accessible link names. French and
Arabic browser assertions exercise the hub at desktop, iPhone, Android, and
tablet sizes. Its route targets and permission-gated entries are unchanged.
The administrator settings directory embedded on the hub and the dedicated
Administration index now translate destination labels, groups, search controls,
and Open actions in French and Arabic. Most destination pages and some account
or error copy remain English, so this closes another prominent display gap
without completing Lumen localization. Candidate hub English baseline and
French/Arabic renders from the earlier milestone are retained in task scratch at
`seerrng-me-localization-20261119`.

The administrator directory fixtures verify both routes, RTL direction, route
destinations, and no horizontal overflow at desktop, iPhone, Android, and tablet
sizes. Matching baseline/candidate renders were inspected at 1440 CSS-pixel
desktop and 390 CSS-pixel iPhone widths for both locales; the existing
settings-list and toolbar owners remain unchanged. Most destination pages
remain English. The localized cases also passed against a freshly built
embedded asset served under an isolated Express `/lumen/` static mount (8
browser cases); qualification through SeerrNG's full production server mount
remains open. Independent linguistic review also remains open. Visual evidence is retained in
`seerrng-admin-directory-visual-20261119`.

The shared Lumen shell now localizes search prompts by media scope, Back
accessibility labels, and the missing-page heading, explanation, and recovery
links. The media-server re-authentication notice is translated as well. French
and Arabic fixtures verify the labels and missing-page state on desktop, iPhone,
Android, and tablet. Baseline and candidate `/me` and missing-page renders were
compared at 1440 × 900 and 390 × 844; existing shell geometry, text wrapping,
and mobile-tab placement are unchanged. Screenshots and comparison montages are
retained in `seerrng-shell-localization-visual-20261119`. Other Lumen routes
and some shell messages remain English; full locale coverage is still open.

### Open gap in personal discovery accounts

Lumen's Linked Accounts page manages sign-in methods and personal tracking
accounts. My Media can read libraries from linked tracking accounts. The
Lumen administrator Discovery page manages instance credentials. Lumen can
connect Trakt, AniList, and Simkl from Linked Accounts.

| Workflow                           | Existing API and acceptance                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read, disconnect, and allow writes | Lumen Linked Accounts uses the authenticated discovery accounts endpoint and provider-specific delete and preference operations. Desktop and iPhone browser fixtures verify preference readback, a denied write, cancellation, and confirmed disconnection. Matched visual verification is recorded below; live provider verification remains open.                                                                                            |
| Trakt                              | Lumen completes the existing server-verified callback from Linked Accounts. Use the configured HTTPS application origin so the browser can return with its session and callback cookies. Server tests cover Classic PKCE and bundled and standalone return routing. Desktop and iPhone fixtures cover account-owner linking and single-use completion. Matched visual verification is recorded below; live provider verification remains open. |
| AniList                            | Lumen opens the provider authorization URL and submits the returned code through the completion endpoint. Desktop and iPhone browser fixtures cover successful readback, clearing the code on cancellation, and keeping the code out of the URL. Matched visual verification is recorded below; live provider verification remains open.                                                                                                       |
| Simkl                              | Lumen displays the device code and expiry, then polls at the server's interval. Polling stops on expiry, cancellation, account change, or unmount. Desktop and iPhone fixtures cover cancellation, a changed polling interval, and account readback after approval. Matched visual verification is recorded below; live provider verification remains open.                                                                                    |

The shared server routes live in `server/routes/discoveryIntegrations.ts`.
Classic's account controls are in `src/components/DiscoveryIntegrations/Accounts.tsx`.
The Linked Accounts and My Media browser suites run against both the standalone
build and the production bundle served by Express at `/lumen/`. Desktop and
iPhone cases cover the provider round trips, library selection and pagination,
private matches, and tracking updates using fixture API responses. Linked
Accounts English baseline captures from `c86e57bde` and the French and Arabic
candidate captures from `e350c6dce` were compared at matching desktop (1440 × 900) and iPhone (390 CSS-pixel width) viewports. Translated labels wrap within
the existing controls, and the browser fixtures confirm no horizontal overflow.
Live provider effects remain unverified. Screenshots are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-linked-accounts-visual-20261122/`.

### Game Finder verification

Lumen supports filtered QuestarrNG searches, saved searches, notification
preferences, and retrying a failed page without losing earlier results.
The desktop and iPhone browser fixtures cover search, pagination, retry,
save, run, delete, and game detail links on both standalone Lumen and the
production bundle served by Express at `/lumen/`. The bundled frontend
redirects the Classic `/discover/games` entry point to Game Finder. Live
QuestarrNG effects and matched visual verification remain open.

### Game Finder localization

Game Finder now localizes its filter names, input guidance, search and saved
search actions, match and retry states, loading and empty copy, and delete
confirmation in English, French, and Arabic. The browser fixture exercises the
complete search, pagination recovery, save/readback, rerun, and confirmed delete
workflow in all three locales across desktop, iPhone, Android, and tablet in
standalone production and the bundled Express `/lumen/` mount (24 cases total).
It verifies RTL direction for Arabic, no horizontal overflow, and the existing
exact discovery and saved-search payloads. Candidate French desktop and
phone and Arabic desktop and phone captures were inspected; the lengthy French
phone labels were shortened to fit the existing field layout. No matching
pre-change screenshots were available, so visual comparison remains unverified.
Live QuestarrNG effects and independent linguistic review remain open. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-game-finder-localization-20261121/`.

### Following feed increment

Lumen has a Following route, with a desktop sidebar link and a Library entry
under You on narrow screens. Users with request access can page through updates,
mark them seen, and manage existing subscription notifications, automatic book
requests, and removals. The standalone proxy serves this route directly.

Person details offer Follow and Unfollow using the native TMDB person
identity. Updates include Classic’s explanation when the API supplies the
required fields. Game updates link by catalog ID and patch updates preserve
the version when present. Search updates preserve the server’s query and
fall back to the update title if the query is absent. Opening an unread
update marks it seen. TMDB subscriptions link to the source person, studio,
network, or genre. Twelve browser cases passed per deployment using API
fixtures at desktop, iPhone, Android, and tablet sizes. The bundled cases
served the production build through Express at `/lumen/`. The suites verify
expansion and patch explanations, game and version-specific patch links, and
marking an update seen. Live provider and matched visual review remain open.

Movie and Series browse show Follow for a single included genre, a selected
production company, or a TV network when the viewer has request access.
These controls use the same identities as Classic. Sixteen browser checks
passed per deployment across desktop, iPhone, Android, and tablet, including
the submitted genre, studio, and network identities. The bundled run used
the Express mount and both runs used API fixtures. Nine separate server
tests passed for follow admission, event persistence, and feed policy.
Matched visual and live provider verification remain open.

Headed Chrome at 1440 × 1000 verified the fixture's `/following` feed and
`/me` link. Mark Seen removed the row control and unread action after the
successful response. The rendered rows initially inherited the browser's list
indent. Resetting it in the shared list style aligned the update and subscription
rows with the existing You screen. The isolated desktop could not reach the
fixture, so this check used a dedicated session on the persistent Agent GUI VM.
Narrow and embedded-browser visual acceptance remains open.

Following's feed, subscription controls, access-denied state, and event reason
messages now use Lumen locale strings in English, French, and Arabic. Four
standalone localization cases pass at desktop, iPhone, Android, and tablet
viewports; the existing 44-case fixture-backed Following workflow suite also
passes. Matched English/French desktop and iPhone screenshots, plus Arabic
desktop and iPhone screenshots, were reviewed with no new overflow or layout
changes. Live provider, role-matrix, native-matched, and embedded-browser
acceptance remain open.

Book details offer Follow New Releases for an identified author. Audiobook
details offer Follow for each listed solo narrator in the narration picker.
Twenty-four browser cases passed per deployment across desktop, iPhone,
Android, and tablet. API fixtures verify author follow and unfollow,
narrator identity, and preservation of an explicitly selected edition.
Matched visual and live provider verification remain open.

The shared Follow button's default label and the software-expansion, future
novel-volume, and audiobook-narrator labels now follow the saved English,
French, or Arabic locale. The existing browser fixtures verify the default
French and Arabic labels, expansion identity and confirmed state in French,
narrator interpolation in French, and future-volume identity and confirmed
state in French across desktop, iPhone, Android, and tablet. Matching French
person-page screenshots were inspected at desktop and iPhone sizes; the action
fits the existing heading row without overflow. API permission and follow
behavior are unchanged. Live provider and native-matched visual verification
remain open.

Anime series details now open the manga and novel continuation lookup on
demand. Users can change seasons, inspect match evidence, open mapped volumes
or search, and follow future novels in the selected lookup language. Four
standalone browser cases verified deferred lookup, season selection,
translation status, the volume link, and the follow payload with API
fixtures. The bundled production build at `/lumen/` passed all 28 Following
cases, including the four continuation cases. Eight server tests passed for
season ordering and derivation of volume and chapter positions. Live provider
and matched visual checks remain open.

The AniList franchise screen offers the same continuation lookup for
titles without a TMDB match. Eight targeted standalone cases and the
44-case bundled Following suite passed with API fixtures. A direct live
AniList lookup also returned season options and manga source material
for Naruto using isolated SQLite. Live browser navigation and matched
visual review remain open.

Continuation results explain when the next position was estimated from
the end of a season and flag unconfirmed volume numbers. Eight targeted
fixture-based browser checks passed per deployment, covering the wording,
source links, and season selection. Matched visual review remains open.

Continuation from a TMDB series starts with its latest listed season,
matching Classic. AniList starts with the current anime entry. The eight
targeted standalone cases and 44-case bundled Following suite passed
with API fixtures. Matched visual review remains open.

### Release Calendar increment

Lumen now serves `/calendar` in both deployments. The Release Calendar uses
SeerrNG's calendar API for monthly windows, media filters, permission-gated
scopes, and administrator-only unmonitored releases. It links normalized
calendar items to the corresponding Lumen title screens and distinguishes
partial results, truncation, and empty months. Coming Soon still serves the
separate discovery workflow. Fixture-backed browser qualification now covers calendar rendering and title
links on both deployments; live providers and matched native visuals remain open.

Headed Chrome at 1440 × 1000 rendered the standalone calendar with a timed TV
episode, an all-day audiobook, and a partial-source warning. Next Month moved the
fixture query from November to December 2026. The isolated desktop could not
reach the preview, so verification used a dedicated Agent GUI VM session.
The eight-case calendar suite passes on desktop, iPhone, Android, and tablet in standalone Lumen and the production Express `/lumen/` mount. Narrow native-matched and live-provider visual acceptance remains open.

The calendar title, filter labels and choices, release type, availability,
episode scope, partial/error/empty states, and date-change copy now follow the
saved English, French, or Arabic locale. Dates use the saved locale as well.
Twenty-four localization cases passed across desktop, iPhone, Android, and
tablet in standalone and bundled `/lumen/` deployments. The first bundled run
found that the browser spec opened `/calendar` instead of `/lumen/calendar`;
the mount-aware path fix is in `calendar-localization.spec.ts`. The
existing eight-case calendar suite still passes. English/French desktop
screenshots and French iPhone plus Arabic desktop/iPhone renders were reviewed
against the same fixtures; there is no overflow or geometry change. The native
month input's displayed month name remains controlled by the browser's UI
locale, and live-provider plus matched-native visual checks remain open.

Lumen's Release Calendar now includes the same explanation of supported release
categories as native SeerrNG. English, French, and Arabic use the Lumen locale
overrides. Twelve browser cases verify the localized description and existing
calendar states across desktop, iPhone, Android, and tablet. French desktop and
iPhone plus Arabic desktop and iPhone baseline/candidate screenshots were
inspected; the description wraps without horizontal overflow and Arabic keeps
RTL direction. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-admin-users-localization-20261120/calendar-description/`.
Production `/lumen/` rendering and native-matched visual comparison remain open.

### Movie and series range-filter localization

Movie and series Browse range controls now use the saved Lumen locale for
release-date, rating, runtime, and vote-count labels, their Apply/Clear actions,
and invalid-range/date feedback. English, French, and Arabic are covered. The
browser spec passes 12 cases across desktop, iPhone, Android, and tablet in
standalone and embedded `/lumen/` deployments. For `/movies` and `/series`, the
empty range-filter state and the reversed-date validation state were checked.
The embedded English baseline built from `78f372fcd` was compared with the
current English, French, and Arabic candidates at 390 × 844 and 1440 × 900.
Translated controls wrap within the existing layout, with no horizontal
overflow or CSS/geometry change. The native date input's placeholder remains
controlled by the browser locale. Other Browse controls and route copy remain
untranslated and are still open. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-browse-ranges-20261121/`.

### Movie and series Browse chrome localization

The shared movie and series Browse screen now localizes title search labels,
availability controls, filter clearing, sort label, no-results copy, capped
catalog copy, the 4K-unavailable fallback, and genre-directory empty state in
English, French, and Arabic. Existing filter parameters and request behavior
are unchanged. Browser fixtures cover `/movies` and `/series`, including a
successful empty catalog response, range validation, and reset. Twenty-four
cases pass across desktop, iPhone, Android, and tablet in standalone and
bundled `/lumen/` deployments. Matched 1440 × 900 and 390 × 844 baseline and
candidate screens were inspected; English geometry is unchanged, translations
wrap within existing controls, Arabic keeps RTL, and no horizontal overflow was
found. Dynamic language/country names and page guidance were localized in the
follow-up Browse page-copy increment. Other non-filter Browse copy remains
open. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-browse-chrome-20261121/`.

### Movie and series Browse filter localization

The remaining movie and series filter labels and shared filter controls now
follow the saved English, French, or Arabic locale: network and series status,
production studios, streaming-provider selection, subject tags, genre matching,
content rating, original language, and the complete sort choices. The shared
GenrePicker keeps caller-provided labels for Music release types while
localizing its selection and match controls. Browser fixtures verify the movie
and series filter interactions in all three locales on desktop, iPhone,
Android, and tablet, in standalone and embedded `/lumen/` deployments (24
cases). Additional desktop checks cover the shared genre picker on Books,
Music, and Comics in both deployments (6 cases). Existing query parameters,
include/exclude values, and filter application behavior are unchanged. Matched
English baseline and candidate screens at 1440 × 900 and 390 × 844 were
compared; French and Arabic were inspected at the same sizes. Translated labels
fit the existing controls and no horizontal overflow was found. Remaining
non-filter Browse copy remains open. Page heading, subtitle,
search-hint, genre-directory heading, and dynamic language/country name
localization are covered by the following increment. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-browse-chrome-20261121/`.

This follow-up closes the remaining user-facing streaming-provider helper copy:
the group heading and accessible name, 50-provider guidance, and selected count
now follow English, French, and Arabic. The same Browse screen now localizes
the shared pagination failure, retry, and loading labels. Browser fixtures
exercise zero-to-one provider selection and pagination failure/recovery across
desktop, iPhone, Android, and tablet (36 standalone cases). English, French,
and Arabic provider-filter and pagination screenshots were captured at desktop
and phone sizes; Arabic RTL and the phone retry state were inspected. No CSS or
layout changes were needed. This closes those filter and paging strings only;
other non-filter Browse copy remains open. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-browse-streaming-filter-20261122/`.

### Music discovery localization

The Music discovery shell, search placeholder, sort menu, release type picker,
artist lookup states, date and availability filters, clear/apply actions, empty
state, and paging action now follow the saved English, French, or Arabic locale.
Release type and sort values sent to SeerrNG remain unchanged. Existing
bookmarked query parameters, discovery endpoint filters, and album request
behavior are preserved.

The bookmarked-filter and provider-failure/retry browser flows pass in
standalone and embedded production builds for all three locales and the
desktop, iPhone, Android, and tablet projects (48 cases). They check translated
controls and release type dialog, restore a saved filter set, apply a changed
artist/date/quality selection, clear filters without removing the search query,
and retry a failed catalog load into its localized empty state. Matching
baseline and candidate renders at four viewports were captured; French desktop
and Arabic phone candidates were inspected, with no new overflow or geometry
changes.
Collector pages and live MusicBrainz/Lidarr behavior remain open. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-music-discovery-20261121/`.

### Music discovery compact filter panel

Matched native and bundled-Lumen renders using the same populated album fixture
showed that Lumen's always-expanded genre, artist, release-date, and availability
fields pushed the first result under the fixed phone navigation. Those secondary
filters now use the existing accessible More Filters disclosure. It starts
closed for an unfiltered visit and opens automatically when a bookmarked filter
is active; search, sort, release type, playlist actions, and collector picks
remain visible. Filter query names, selected values, and submission behavior are
unchanged.

The targeted standalone Music discovery suite passes all eight cases across
desktop, iPhone, Android, and tablet. A production build of the embedded
frontend and fixture-backed native/Lumen comparison pass at 1440 × 900 and
390 × 844 with no horizontal overflow. Matched native/Lumen desktop and phone
captures, plus the expanded-filter candidates, are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-music-visual-parity-20261123/`.
The phone candidate keeps the album artwork and title visible above the fixed
navigation; live MusicBrainz/Lidarr data remains unverified.

### Music album and artist detail localization

Album and artist detail pages now localize their page-owned failure headings,
album request and discography actions, track and listen counts, fact labels,
artist release groups, year/count summaries, and artist-filter action in English,
French, and Arabic. Album identities, track and artist metadata, playback
counts, endpoint paths, request permissions, and request payloads continue to
come from the same API and existing action owners.

The fixture-driven album and artist detail flow passes in standalone and
embedded production builds across all three locales and four viewport projects
(24 cases). It verifies localized labels and actions, count formatting, facts,
artist release grouping, and no horizontal overflow. French desktop and Arabic
phone baseline/candidate captures were inspected; the visual layout remains
within the existing composition. Shared Indexer Search, Association, and
Blocklist actions now use the selected English, French, or Arabic locale in all
consumers, including movie, TV, book, comic, magazine, music, and game details.
Blocklist confirmation copy, interpolated title guidance, retry action, and
success/failure feedback are localized at the shared owner. Live
MusicBrainz/Lidarr behavior and independent translation review remain open.
The French desktop and Arabic phone candidate screenshots were compared with
the previous detail captures at matching viewports; the longer labels reflow
the action row naturally without horizontal overflow. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-music-detail-localization-20261121/`.

### Shared detail action localization

The shared Prowlarr search, Associations, and Blocklist actions now localize
their labels across all detail-page consumers in English, French, and Arabic.
Blocklist confirmation, retry, and success/failure feedback copy is included;
request identities, permissions, mutation payloads, and routes are unchanged.
Browser verification passed the album/artist flow in both standalone and
Express-mounted production builds across three locales and four viewports (24
cases), five Blocklist permission and identity cases, and ten existing
Indexer Search and Associations cases. Matching French desktop and Arabic
phone captures were compared with the preceding detail renders. They retain
the established layout, with natural wrapping of longer action labels and no
horizontal overflow. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-shared-actions-20261121/`.

### Movie and series Browse page-copy localization

Movie and series page headings, search hints, request guidance, and genre
directory headings now follow the saved English, French, or Arabic locale.
Original-language and country options use locale-aware `Intl.DisplayNames`
with their existing provider labels as a fallback for unknown codes. Follow
actions also use localized verbs. Browser coverage verifies both routes and
genre directories, their dynamic language and country names, and the existing
filter flows in all three locales, across desktop, iPhone, Android, and tablet,
in standalone and embedded `/lumen/` deployments (24 cases). The English
1440 × 900 and phone captures are pixel-identical to the prior approved Browse
baseline; French and Arabic desktop/phone renders were inspected, retain RTL,
and have no horizontal overflow. Native date placeholders remain browser
locale-controlled. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-browse-chrome-20261121/`.

### Browse localization regression restored

A later Browse-filter consolidation removed the locale hook and replaced translated labels with English fallbacks, despite the localization ledger above remaining marked complete. This increment restores the locale hook on the consolidated movie and series screens, including range controls, filter headings, page guidance, dynamic language and country names, service feedback, retry actions, and empty/capped result states. The existing query parameters and filter submission behavior are unchanged. The browser spec now matches the consolidated single-panel interaction and verifies English, French, and Arabic across desktop, iPhone, Android, and tablet in standalone and embedded `/lumen/` deployments (48 browser cases). Fresh French desktop and Arabic phone captures were reviewed alongside the English baseline at the same viewport; RTL and no-overflow assertions pass. Evidence is retained at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-browse-restore-20261121/`.

### Bounded Browse availability paging

Movie and series availability views that require local filtering now report the
number of catalog entries checked using the saved account locale. Their
existing five-page scan cap remains intact; the localized Look Further action
advances the cap by another five pages. A browser regression returns an empty
provider catalog, verifies the exact five-page initial bound, resumes at page
six, and proves the next stop occurs at page ten. English, French, and Arabic
fixtures pass across desktop, iPhone, Android, and tablet, in standalone and
embedded `/lumen/` deployments (24 cases). This verifies client paging against
fixtures, not live provider latency or server rate-limit behavior. Screenshots
show the English capped state pixel-identical to baseline commit `a40c10922`
at desktop and iPhone viewports; French and Arabic desktop and phone states
were inspected, including the long result summary and continuation button.
Results and screenshots are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-browse-chrome-20261121/`.

### My Media browse increment

Lumen serves `/library` in both deployments and exposes My Media in desktop
navigation and under You. It lists libraries from connected Plex, Jellyfin,
Emby, Trakt, AniList, and Simkl accounts, preserves server cursors, and opens
only confirmed catalog identities. Linked-account return/recovery, identity
repair and private mapping packs, provider tracking writes, episode progress,
and resumable scans have fixture-backed coverage. Personal and delegated
Watchlists preserve combined-list ownership and have standalone and bundled
fixture coverage. The native library route reads the signed-in user's own
connected media-server and tracking accounts (`req.user.id`); it exposes no
delegated library-sharing API or permission, and Lumen uses that same current
user contract. Therefore there is no separate delegated-library-sharing
workflow to reproduce. Household Games sharing is a separate workflow. Live
provider effects and matched native/bundled visual acceptance remain open.

Headed Chrome at 1440 × 1000 verified the My Media screen using a synthetic
Plex connection. It selected the first visible library, linked the matched
movie, showed the unmatched title without a link, and loaded page two with the
fixture's cursor. Checks used a dedicated Agent GUI VM session because the
isolated desktop pool could not reach the fixture network in the prior two
increments. Tracking-provider and narrow layouts still need rendered evidence.

### Watchlist increment

The personal Watchlist reads the signed-in user's existing SeerrNG and Plex
watchlist. For local lists it supports title, media, and sort filters, shareable
filter and page URLs, and removal with confirmed catalog identity. Combined
lists preserve provider order and avoid offering local removal for rows whose
ownership source cannot be distinguished. Watchlist creation from detail pages
is covered for video and books. Delegated access and combined-list local removal
are covered in standalone and bundled browser suites. Poster actions now have a
separate cross-media qualification.

Headed Chrome at 1440 × 1000 verified a movie filter opened from a bookmarked
URL, cleared it to show a second item, and removed the movie through the
fixture API. The remaining book was still shown after the server response.
Narrow and combined Plex behavior is now fixture-covered in standalone and bundled browser runs. Native-matched visual acceptance remains open.

Movie and series details now offer the local Watchlist action. The action
checks current membership and title identity before writing and uses the
existing authenticated SeerrNG endpoint. Plex provider mutations and
narrow/native-matched visual acceptance remain open.

Headed Chrome at 1440 × 1000 rendered the local-account movie action and
verified Add and Remove against a synthetic API. The unavailable branches and native-matched visual acceptance remain open; series and narrow layouts are covered by the watchlist browser suite.

The local detail action now also covers Open Library works, MusicBrainz
release groups, ComicVine editions, and magazines. It uses the same permission
and preflight checks as movie and series details and keeps provider identities
separate. Bookshelf-only works without an Open Library identity still cannot
use SeerrNG's existing local Watchlist API. Plex provider actions remain open.

Movie, series, book, album, magazine, and eligible comic edition browse posters
offer the Watchlist action on desktop hover and touch layouts. The poster uses
the shared detail preflight only after the viewer activates it, so browsing a
catalog does not request membership once per card. When membership is unknown,
its first activation means Add; a fresh detail read confirms an existing saved
item without deleting it. Blocklisted titles and Plex primary accounts do not
get the control. The existing authenticated Watchlist endpoints remain
responsible for add and remove.

Twenty-eight browser cases passed in standalone Lumen and another 28 against the
production Express `/lumen/` mount across desktop, iPhone, Android, and tablet.
They cover movie and series add/remove round trips, a safe first activation,
Plex-account exclusion, and exact book, comic edition, album, and magazine
identities.
Baseline and candidate movie poster renders were captured at matching viewport
sizes and route state in
`/mnt/disks/scratch/codex-task-scratch/lumen-poster-watchlist.i6lPym/`.
The shared Watchlist action now uses translated native button labels, localized
accessible names, and locale-aware success and recovery messages on poster and
detail actions. English, French, and Arabic browser fixtures verify the locale,
RTL direction, and exact add/remove labels and feedback. The full 28-case poster
action matrix passes across desktop, iPhone, Android, and tablet; the localized
movie add/remove case passes for French and Arabic on all four viewports. The
same locale matrix was captured in standalone Lumen at 1440, 834, 412, and 390
CSS pixels; Arabic toast copy fits above the mobile tabs. French and Arabic
custom feedback currently fall back to English in other Lumen locales. Live
provider effects and native-matched visual acceptance remain open. The complete
watchlist suite now passes under both standalone Lumen and the production
Express `/lumen/` mount.

Comic poster actions are available only when the browse result provides a
supported edition identity; the comic detail action remains covered separately.
Native-matched visual acceptance and live provider effects remain open.

Headed Chrome at 1440 × 1000 rendered the Open Library detail action. Add and
Remove completed against a synthetic account and used the canonical work ID in
the request. Native-matched visual checks for albums, comic edition changes,
magazines, and narrow layouts remain open.

### Download Inbox browse increment

Lumen's Download Inbox shows active warnings, resolved items, and intervention
history for accounts with Manage Downloads access. Direct navigation with no
permission shows the access message and does not fetch queue data. The
standalone proxy serves the screen directly.

Headed Chrome at 1440 × 1000 verified the authorized Inbox, History switch,
partial-source warning, and expanded action record against synthetic data.
The complete Download Inbox browser suite passes 16 cases per deployment across desktop, iPhone, Android, and tablet, including denied direct access, queue/history reads, file import, and rejection defaults. The active warning list was compared with native SeerrNG at 1440 × 900 and 390 × 844 using the same synthetic warning and partial-source state. Lumen's muted note color understated the missing-service warning; it now uses the shared wait-status color token. Native comparisons of the import and rejection sheets and live service handoff remain open. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-download-audit-20261122/`. The Inbox is loaded on demand so the home entry does not download its 1.51 kB gzip route chunk.

Lumen's Download Inbox now also offers manual import and rejection. The
import sheet uses the backend's current file preview, eligible selections,
confirmed library target, and preview fingerprint. Rejection offers distinct
blocklist and client-removal controls, with client removal off by default.
Both actions re-read the inbox after submission or an uncertain result.
Headed Chrome at 1440 × 1000 verified the manual import and rejection flows
against synthetic data. That earlier interaction check did not include mobile
or bundled visual acceptance; the subsequent localization qualification below
records those checks. Active-list native comparison is now recorded above;
Lumen's import and rejection sheets have now been inspected at 1440 × 900 and
390 × 844 in standalone and bundled builds. The first phone capture exposed a
search control clipped past the sheet edge and a long import-mode value hidden
inside its pill. The shared sheet grid now constrains its content track, the
search field can shrink, and the import mode uses the reusable stacked select
layout. Browser checks assert that both the search action and select fit within
the dialog. All 16 Download Inbox browser cases passed against standalone and
bundled Lumen across desktop, iPhone, Android, and tablet. Both Lumen builds
passed. The broader `pnpm --dir lumen test` run failed in its container image
checks when the image build reported TypeScript errors in
`AccountThemeOverrides.tsx`; this component is outside this change. A native
`/downloads` baseline attempt rendered SeerrNG's generic “Oops” page in the
isolated test instance, so native sheet comparison remains unverified; live
service handoff remains open.

The import and rejection presentations have since been compared using the same
synthetic warning, library match, eligible/ineligible files, and rejection
defaults. Native SeerrNG expands each action inline within its warning card;
Lumen uses its established centered dialog on desktop and bottom sheet on
phones. This is a composition difference, while both surfaces expose the same
target/file decisions, copy-versus-move choice, blocklist default, and opt-in
client removal. The native import and rejection states were inspected at
1440 × 900; rejection was also inspected at 390 × 844. The current Lumen
production bundle was inspected at 1440 × 900 and 390 × 844 for both actions;
the phone sheet keeps the complete rejection controls visible and the import
selection usable. All 16 current `download-inbox.spec.ts` cases passed against
that bundle across desktop, iPhone, Android, and tablet. Captures are retained
at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-download-native-20261123/native/`.
These fixture renders do not verify live service handoff.

The Inbox and both intervention sheets now read the signed-in user's locale for
warning states and resolutions, history, pagination, dates, service errors,
import controls, rejection controls, and action feedback. The page reuses
SeerrNG's `downloads.*` catalog across its supported locales; additional
pagination and fallback-error messages have English, French, and Arabic
overrides. Import target selection, eligible-file and fingerprint checks,
owner permissions, blocklist defaults, and the default-off client file removal
are unchanged. Browser coverage passes all 16 cases on the standalone app and
all 16 on SeerrNG's `/lumen/` Express static mount. English, French, and Arabic
saved-locale cases each pass across desktop, iPhone, Android, and tablet in
both deployments. Matching pre-change and candidate screens were rendered with
the same fixture at 1440 × 900 and iPhone 13 dimensions; French and Arabic
Inbox, history, import, and rejection states were inspected. Evidence is retained in
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-downloads-localization-20261120/`.
Provider-supplied warning text remains as returned, custom fallback messages
use English outside English, French, and Arabic, and live service handoff
remains unverified. Active-list and intervention-sheet native comparisons are
recorded above. The page also includes the
native Download Inbox description from SeerrNG's localized catalog. The same
fixture was captured before and after this addition at desktop and iPhone sizes;
French and Arabic candidate layouts were inspected.

### Indexer Search increment

Lumen's Indexer Search uses the existing Manage Requests permission and
Prowlarr configuration, search, and handoff endpoints. Configuration now
identifies which media categories the server allows for the account. The
search form excludes disabled or unmapped categories, accepts prefilled
category and query links, preserves the submitted search when paginating,
and shows indexer name and details only when allowed. The handoff uses the
server's single-use result handle.

Headed Chrome at 1440 × 1000 loaded the standalone and bundled production
builds against synthetic responses. Standalone testing covered a disabled
prefilled category, search, pagination, hidden indexer details, and handoff.
The bundled build rendered the form and results. The route reuses Lumen's
existing page header, search, toolbar, and list roles. Phone visual acceptance
is now recorded for the loaded search form and result row at 390 × 844,
alongside the desktop render at 1440 × 900. The browser suite also verifies
that the result action can be scrolled clear of the fixed phone navigation.
Forty cases passed in standalone Lumen across desktop, iPhone, Android, and
tablet. Screenshots are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-download-audit-20261122/indexer-screens/`.
Comparison against rendered native workflows and an end-to-end live service
check remain open.

The screen now reads SeerrNG's native `components.IndexerSearch.*` catalog for
the full search flow, result metadata, category names, and handoff feedback.
French and Arabic overrides cover the no-category state, result count, and
uncertain handoff warning; other supported locales use their native catalog
where available and English fallback otherwise. Search filtering, query
prefills, pagination, permissions, and one-use handoff behavior are unchanged.
The Indexer Search suite passes 28 cases in standalone Lumen and 28 against the
production `/lumen/` Express mount, across desktop, iPhone, Android, and tablet.
Saved-locale French and Arabic flows each pass on all four viewports in both
deployments. Pre-change and candidate fixture renders were compared at 1440 ×
900 and iPhone 13 (390 CSS pixels); translated text fits the existing page and
result rows without horizontal overflow. Evidence is retained in
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-indexer-localization-20261120/`.
Live Prowlarr effects, independent linguistic review, and native-matched visual
acceptance remain open. Lumen also displays the native notice that sending a
release does not alter a SeerrNG request. While searching, category selection is
disabled; changing category afterward clears stale results, counts, and
pagination before a new search. Submitted query/category pairs remain fixed for
pagination. The focused acquisition suites pass 48 cases per deployment in
English, plus eight cases per locale and deployment in French and Arabic. The
French iPhone baseline/candidate and Arabic iPhone candidate were inspected at
matching fixture states; translated notices wrap without horizontal overflow.

Indexer Search now follows changed `category` and `query` URL parameters while
the page remains mounted. A new prefill clears old results and single-use
handoff state, and invalidates any outstanding search so a delayed response
cannot replace the newly requested search. The browser regression changes the
URL during a pending search, verifies the new prefill, and confirms only a
manual submit starts the second request. All 44 Indexer Search cases pass in
standalone Lumen and all 44 pass against a production bundle built with the
`/lumen/` base path, across desktop, iPhone, Android, and tablet. This
state-transition change has not yet had matched native/Lumen screenshots; live
Prowlarr handoff and native-matched visual acceptance remain open.

Lumen's administrator Prowlarr settings and diagnostics now also use SeerrNG's
`components.SettingsProwlarr.*` locale catalog. The connection form, saved API
key controls, category mappings, per-category indexer assignments, search
limits, connection coverage, diagnostics, and save/test feedback follow the
account's saved locale. English, French, and Arabic are checked across desktop,
iPhone, Android, and tablet. The three Prowlarr browser workflows pass 12 cases
in standalone and bundled Lumen; matched before/after and candidate captures are retained
in `/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-prowlarr-localization-20261120/`.
Request payloads, saved-key retention, test-only draft submission, empty
assignments, and cleared limits remain covered. Live Prowlarr behavior,
independent linguistic review, and native-matched visuals remain open.

### Indexer Search release-size parity (2026-11-23)

Indexer Search now formats result sizes with the same binary B, KB, MB, GB, and
TB units and one-decimal precision as native SeerrNG. This prevents sub-megabyte
releases from appearing as `0 MB` and avoids reporting large files as thousands
of MB. The result fixture verifies 512 B and 1.5 GB, while the existing
category, pagination, permission, localization, and one-use handoff cases
continue to pass.

All 44 Indexer Search browser cases pass against standalone Lumen and all 44
pass against the production `/lumen/` Express mount across desktop, iPhone,
Android, and tablet. TypeScript and Vite production builds pass. Before/after
result captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-indexer-size-20261123/`;
the desktop and phone candidate captures were inspected. Live Prowlarr search
and download-client handoff remain unverified, as does matched native visual
acceptance for the complete Indexer Search workflow.

### Indexer Search state guidance parity (2026-11-23)

Native SeerrNG keeps the Indexer Search description visible when Prowlarr is
disconnected or no media categories are available. Lumen previously returned
from those states before rendering the description. The shared introductory
copy now appears in all three states; the normal search view retains its
additional handoff guidance. Browser coverage checks the disconnected and
no-category states in English, French, and Arabic. Captures are retained in
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-indexer-state-guidance-20261123/`.
The no-category baseline and candidate were rendered and compared at 1440 × 900
and iPhone 13 (390 CSS pixels); the introductory sentence adds one line above
the existing empty-state message without changing its layout. The disconnected
candidate was inspected at the same sizes. The 44-case Indexer Search suite
passes on standalone Lumen and on the production SeerrNG `/lumen/` mount. The
disconnected and no-category states each pass in French and Arabic across all
four viewport projects in both deployments. Populated native/Lumen comparison
and live Prowlarr handoff remain open.

### Native administrator settings bookmark compatibility (2026-11-23)

Native `/settings/*` bookmarks now resolve to Lumen's matching administration
pages, including per-channel notifications, media-server libraries, Prowlarr,
the user directory, and general settings. The legacy user-settings bookmark
opens User Management, and the `4K` search target opens Request Settings; the
application API-key target opens General Settings. Service bookmarks retain
their supported query context, and browser fragments survive redirects. Lumen's
existing administrator route guards continue to deny non-administrators before
loading administrator settings.

Eight browser cases pass across desktop, iPhone, Android, and tablet in both
standalone and production `/lumen/` Express-mounted builds. The cases exercise
the native route set, legacy search targets, query/fragment preservation, and
denied request-manager access with no administrator settings reads. TypeScript
and production builds pass. Direct server middleware tests verify the user and
4K redirect destinations. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-bookmarks-20261123/`.

Administrator System Logs now follow the saved account locale for search,
severity, paging, refresh, details, copy feedback, loading, empty, and error
states. SeerrNG's existing translated log catalog supplies common labels, with
English, French, and Arabic Lumen messages for the remaining controls and
severity descriptions. This change also fixes saved severity restoration: the
selected full level value is retained instead of its first character. The 12
existing log behavior cases and eight locale cases pass in standalone and
bundled Lumen across desktop, iPhone, Android, and tablet. French and Arabic
before/after captures were inspected at desktop and iPhone widths; existing
layout and navigation owners remain unchanged and all tested widths avoid
horizontal overflow. Evidence is retained in
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-logs-localization-20261120/`.
Live log-service behavior, independent linguistic review, and native-matched
visual acceptance remain open.

Administrator Scheduled Jobs now follow the saved account locale for job
states, next-run dates, confirmations, scheduling controls, and recovery
feedback. SeerrNG's native jobs catalog supplies process, command, enabled,
disabled, run, and cancel labels; Lumen localizes the remaining scheduler
controls and uses plural-aware seconds, minutes, hours, and days descriptions.
The existing run/cancel confirmation, cron request, schedule readback, and
periodic refresh behavior are retained. The localized schedule workflow now
also verifies a rejected save: the edited schedule stays in the form, the
save action remains available, and retry persists and reads back the change.
This recovery check passes in English, French, and Arabic across desktop,
iPhone, Android, and tablet in standalone Lumen and in the production bundle
served by SeerrNG's Express `/lumen/` mount (12 cases per deployment). The
browser fixture supplies API responses, so it verifies the real built frontend
and mount routing without changing a live scheduled job. The existing eight
job workflow cases and eight locale cases also previously passed in both
deployments across those viewports. French desktop and Arabic
iPhone baseline/candidate renders were inspected; content wraps within the
existing job card and tested viewport widths have no horizontal overflow.
Evidence is retained in
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-jobs-localization-20261120/`.
The bundled save-recovery build and run record are retained in
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-jobs-bundled-20261122/`.
Live scheduler effects, independent linguistic review, and native-matched
visual acceptance remain open.

Administrator System Caches now follow the saved account locale for API cache
metrics, image-cache information, DNS statistics, flush confirmations, and
success or error feedback. SeerrNG's existing cache catalog supplies shared
metric identifiers; French and Arabic Lumen overrides use cache-specific
wording, with English, French, and Arabic messages for the remaining labels.
Cache reads, the app-data path lookup, DNS and API flush endpoints,
confirmation-before-write, and refresh/readback remain intact. Eight localized
DNS flush/readback cases pass in standalone and bundled Lumen for French and
Arabic across desktop, iPhone, Android, and tablet. The existing cache workflow
also passes in both deployments across those four viewports. French desktop
and Arabic iPhone baseline/candidate renders were inspected, and all tested
viewports avoid horizontal overflow. Evidence is retained in
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-caches-localization-20261120/`.
Live cache-service effects, independent linguistic review, and native-matched
visual acceptance remain open.

The same Manage Requests permission now exposes a Search Prowlarr shortcut in
movie, TV, ebook, audiobook, album, artist, comic, magazine, and game details.
The shortcut prefills the media category and title without submitting a search.
Both clients use the same title normalization and URL encoding.
Headed Chrome at 1440 × 1000 compared the standalone movie detail before and
after the change against the same fixture and followed the shortcut to the
encoded movie category and title. The request control kept its existing
dimensions. Other detail layouts, mobile, and bundled visual acceptance remain
open.

### Issue list and discussion increment

Lumen serves `/issues`, `/issues/:issueId`, and the `?issue=` focused link.
Authorized accounts can browse, search, filter by status, and page through
reports with the native API's visibility rules. Issue details show comments,
resolution, quality, and affected seasons or episodes. Managers and owners
with Create Issues can comment, resolve, or reopen. View-only accounts get
the discussion without write controls. The You page exposes the same route
for narrow navigation.

Headed Chrome at 1440 × 1000 checked the standalone list, TV episode scope,
comment submission, and resolution against synthetic data. Issue list, details, reporting, editing, deletion, media links, filters, and paging now pass their fixture suites in both standalone and bundled deployments across four viewport projects. Matched native visuals and live provider behavior remain open.

### Issue reporting increment

Lumen media details can create reports for movies, series, books, albums,
comic editions, and magazines. The action uses the internal media ID of the
displayed item and the signed-in reporter. The form follows native media
availability, issue type, subtype, and quality rules. Series reports can
scope multiple seasons to whole seasons or selected episodes. Confirmed
submissions open the new discussion.

Headed Chrome at 1440 × 1000 rendered the standalone movie sheet and confirmed
a report with a synthetic API that accepted only the exact internal media ID,
type, quality, and description. Standalone and bundled fixture runs now check
book, comic, magazine and album reports, including their issue-type choices,
reader-specific reason lists, and exact internal media ID and subtype payloads
across desktop, iPhone, Android and tablet. Native visual comparison remains
open. Editing or deleting reports and comments
remains open.

Manage Issues operators can now search for and select a report owner in the
issue sheet. The reporter-search endpoint requires Manage Issues, a two-character
query, and returns only matching account IDs and display names (up to 20); issue
creation still rechecks the selected owner server-side. Its browser flow passed
on desktop, iPhone, Android, and tablet, and the issue-route suite passed 44/44.
Candidate sheet renders are retained in
`/mnt/disks/scratch/codex-task-scratch/lumen-issue-reporters/`. Native-matched
baseline comparison and bundled acceptance remain open.

The shared report sheet now localizes its title, quality and issue-type
controls, reason options, owner picker, season and episode labels, description,
actions, loading and error messages, and media fallback in English, French, and
Arabic. Twelve fixture-backed cases passed on desktop, iPhone, Android, and
tablet, including an exact report payload and opening the submitted discussion.
English baseline and French/Arabic candidate sheets were captured at desktop
and iPhone widths; Arabic RTL alignment and mobile sheet geometry were
reviewed. No overflow or layout-owner changes were needed. Native-matched and
live-provider acceptance remain open.

### Issue editing and deletion increment

Authors with report permissions can edit their own descriptions and replies.
Managers can remove replies from other users, and eligible authors can remove
their own replies. The original description belongs to the report and is
removed through the issue deletion action. Managers can delete any issue and
reporters can delete their own issues when there are no replies. Both deletion
actions use the shared confirmation sheet and existing client and server
permission checks.

Headed Chrome at 1440 × 1000 compared the baseline and candidate on the same
standalone discussion fixture. Editing the description, confirming a manager's
deletion of another account's reply, and confirming issue deletion all worked.
Issue media titles now resolve lazily from the existing detail endpoints for
visible rows and link to the matching media detail. The browser fixture covers
the title and year. Advanced metadata filters and issue-list title metadata are
implemented. Fixture-backed issue actions pass in both deployments across four
viewport projects; native-matched comparison and live provider behavior remain
open.

Issue filters, status and media labels, loading/empty/denial states, pagination,
discussion actions, confirmation copy, accessible labels, and timestamps now
follow Lumen's saved locale in English, French, and Arabic. Twelve localization
cases passed across desktop, iPhone, Android, and tablet; the existing 40-case
issue workflow suite passed across its permission and mutation scenarios.
Baseline English and French candidate screenshots were compared at desktop and
iPhone widths, and Arabic desktop/iPhone RTL renders were reviewed. There was no
horizontal overflow or control-owner/layout change. The locale generator now
stores English fallback strings once rather than copying them into all 38 locale
dictionaries; the standalone main bundle fell from 347.72 KB to 323.39 KB gzip
while adding these issue translations. Live-provider and native-matched
acceptance remain open.

On 2026-11-22, current Lumen Issues and Blocklist list screens were captured at
390 × 997 in Chromium with the same Fight Club fixture as the retained native
reference. The candidate screens had no horizontal document overflow. The
15-case Issues/Blocklist browser suite passed on the iPhone project. The native
screenshots are from November 6 and show older SeerrNGJ filter and media-card
presentation; no current native build or matched current native state was
available, so these captures do not close native-matched visual acceptance.
Candidate captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-issues-blocklist-mobile-20261122/`.
The Issues list summary now also renders a proxied poster and the runtime,
page count, or issue count when the corresponding media endpoint provides it.
The title/year/runtime fixture passed on desktop, iPhone, Android, and tablet;
candidate screenshots are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-locale-gaps-20261123/issues-metadata-candidate/`.
The fixture's artwork is a blank SVG, so live artwork rendering remains
unverified. The flat issue filter toolbar has now been regrouped into the
native Task Filters, Media Filters, Filters, and Sort By disclosures. The full
44-case standalone Issues suite passed; after the final grouped-control markup,
the bookmark/search/metadata/sort round trip passed across four viewports in
standalone and the bundled `/lumen/` mount. The grouped candidate is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-locale-gaps-20261123/issues-filter-groups-candidate/`.
Live provider results and affected-episode metadata remain unverified.
release-note: release-notes/lumen-issue-media-summaries.md

### Blocklist browsing and removal increment

The Lumen Blocklist uses the authorized count endpoint for desktop and You
navigation, keeping the current link visible while the route is active. The
page supports native search, media, source and date filters, sorting and
pagination. Accounts with View Blocklist can browse. Managers can also
confirm removal using the affected entry's TMDB or external identity.

Headed Chrome at 1440 × 1000 verified the list, exact encoded external ID
removal, and empty navigation state against a fixture. Permission checks, search,
filtering, removal and media identities now pass in both deployments across four
viewport projects; matched native visuals remain open. The
detail and collection add actions and administrator automatic-rule settings
are implemented below; their remaining gap is rendered acceptance.

The Blocklist page now localizes its source and media filters, dates, entry
sources, removal confirmation, permission feedback, and save results in English,
French, and Arabic. Twelve localization cases passed across desktop, iPhone,
Android, and tablet; the existing 20-case permission and exact-identity removal
suite passed. English/French desktop and iPhone renders and Arabic desktop/iPhone
RTL renders were reviewed with no overflow or control-owner changes. Longer
French labels wrap the filter row naturally. Native-matched visuals and bundled
acceptance remain open.

On 2026-11-22, the mobile Blocklist list was captured at 390 × 997 in Chromium
with the Fight Club fixture. Its full filter stack and entry fit without
horizontal document overflow. The current candidate is retained with the Issues
capture above. Native-matched visual acceptance remains open because the
available native screenshot is from November 6 rather than the current native
build.

### Blocklist media detail increment

Managers can confirm adding or removing a title from movie, series, album,
Open Library book, ComicVine edition, and magazine details. The action looks
up the exact canonical identity and rechecks the detail, entry, and
navigation count after a change. Request controls reflect Blocklisted after
detail refresh. Bookshelf-only records without a supported Open Library work
identity are excluded from the detail action. Browser fixtures assert the exact add identity for all six supported media
types across desktop, iPhone, Android, and tablet in both standalone and bundled
deployments, alongside the movie add/remove and request-state flow.
The Blocklist API's supported scope is movie, TV, music, book, comic, and
magazine; other Lumen catalogs have no native Blocklist contract.

Headed Chrome at 1440 × 1000 compared the standalone movie detail with its
previous build. The synthetic API confirmed an empty 201 add response and
204 removal, and the UI switched both the request button and navigation after
readback. Mobile and bundled visual acceptance and a rendered native
comparison remain open.

### Movie collection and collection Blocklist increment

Movie details and All search results open a Lumen collection page
in both route configurations. The page uses native collection membership and
release ordering. Member cards retain individual request and Blocklist
state. Managers can confirm collection-wide Blocklist changes using the
existing batch endpoint, with a warning that unblocking also removes
individual member entries.

Headed Chrome at 1440 × 1000 verified standalone search, collection entry,
both confirmed batch actions, and member and navigation state readback
against synthetic data. The rendered native comparison, mobile and bundled
acceptance, bulk requests, progressive collection queue, and collection
playback controls remain open.

### Progressive collection requests increment

Collection details now offer Queue Collection. The existing account-scoped
queue API starts or restarts a one- or two-movie buffer in HD or 4K, using
the account's ordinary request defaults. Lumen polls the selected quality
while the sheet is open and shows watched, requested, waiting, completed,
and stopped states. Existing queues can be stopped after request access is
lost or 4K is disabled. Stopping leaves current requests in place.

Headed Chrome at 1440 × 1000 verified the standalone queue sheet with
synthetic data. A 4K-only account selected a buffer of two, saw a playback
history wait reason, stopped the queue, and restarted it with the same
buffer. Native rendered comparison, bundled and mobile visual checks, live
playback progression, bulk requests, and collection playback remain open.

The queue sheet and its collection-detail entry now localize queue setup,
quality and look-ahead choices, progress, waiting reasons, errors, and stop or
restart actions in English, French, and Arabic. The lifecycle browser case
checks persisted French locale, HD selection, buffer one, queue progress,
stop, restart, and the submitted mutation. The collection suite passed 28
cases across desktop, iPhone, Android, and tablet; the targeted localization
flow also passed on desktop and iPhone. Native rendered comparison, bundled
visual acceptance, live playback progression, bulk requests, and collection
playback remain open. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-collection-queue-localization-20261122/`.

### Bulk movie collection requests increment

Collection details offer a separate Request Collection sheet for eligible HD
and 4K requests. It selects individual movies or all eligible members, rechecks
the collection before submitting, and uses the standard request API once per
selected title. Managers can reuse Lumen's advanced destination controls.
The sheet displays accepted, rejected, uncertain, and newly ineligible
results per title and refreshes the collection when closed.

Headed Chrome at 1440 × 1000 verified a standalone batch with one acceptance,
one rejection, and one blocked movie that was excluded. The fixture accepted
only the two eligible IDs. Mobile, bundled and native comparisons, live
authorization and destination branches, and collection playback remain open.

### Collection playback increment

Collection details expose Play Collection for playable HD and eligible 4K
copies. The picker retains collection order, sends internal media IDs,
omits copies with shared-only playback restrictions, and uses the existing
authorized device and playlist endpoints. The playlist action explains
that it replaces Current Selection and offers a validated link after creation.

Headed Chrome at 1440 × 1000 verified standalone device selection, ordered
playback dispatch, exclusion of a shared copy, and a playlist link for a
changed selection against synthetic data. Mobile and bundled visual
acceptance, comparison against rendered native workflows, and live provider
playback remain open.

The collection playback entry and sheet now localize their labels,
accessibility names, device loading and failure feedback, playlist warning,
and playback result in English, French, and Arabic. A saved-French browser
case verifies the same ordered internal-ID mutation and device feedback. The
collection suite passes 32 cases across desktop, iPhone, Android, and tablet.
Matched English/French desktop and iPhone screenshots were reviewed; French
copy wraps within the existing sheet, with no horizontal viewport overflow.
Bundled visual acceptance, rendered native comparison, live provider
playback, and independent language review remain open. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-collection-queue-localization-20261122/playback-matched/`.

The 20-case collection suite now honors the configured deployment mount and
passed against both standalone Lumen and the production Express `/lumen/`
mount, across desktop, iPhone, Android, and tablet presets. Coverage includes
collection entry, progressive requests, filtered bulk requests, collection
playback, and media-server collection sync. The bundled run exposed and
corrected a stale test assertion that expected an unprefixed movie link; the
production app correctly retains `/lumen/` in internal links. Rendered native
comparison, visual acceptance, and live playback checks remain open.
Standalone request-sheet renders for the four presets are retained under
`/mnt/disks/scratch/codex-task-scratch/lumen-issue-reporters/collection-parity/`;
they inspect the Lumen sheet only and are not native comparison captures.

### Personal profile and password increment

You links to Account Settings. Users can save display name, non-Plex email,
metadata language, and regional-format preferences for their own account.
The form submits only changed fields, preserves failed drafts, and confirms
saved profile values by reading them back. The separate password form uses
the server's password-presence flag, confirms the new password locally, and
clears password fields after each submission.

The 72 browser checks for account settings and household profiles passed
against both standalone Vite and the production Express `/lumen/` mount across
desktop, iPhone, Android, and tablet projects. They use synthetic credentials
and fixture APIs. Native visual comparison, live password and provider paths,
interface localization, linked accounts, tokens, and other account settings
remain open.

### Client token increment

Account Settings links to Client Tokens. The page uses the existing signed-in
session endpoints to list token metadata, create Discover and/or Request
tokens with a selected expiry, and revoke after confirmation. The creation
secret stays in component state and disappears when dismissed or when the
user leaves the page.

Headed Chrome at 1440 × 1000 verified standalone list loading, creation of a
seven-day Discover token, one-time display, and revocation with synthetic
data. The screen now localizes its description, loading and retry states,
token creation and expiry controls, one-time secret notice, clipboard
feedback, token scopes and dates, and the confirmation-based revocation flow
in French and Arabic. Browser fixtures verify failed-list retry, locale-aware
creation, copying a synthetic token, copy failure, dismissing its one-time
display, and canceling and confirming revocation across desktop, iPhone,
Android, and tablet projects. French and Arabic desktop (1440 × 900) and
iPhone (390 × 844) baseline/candidate renders were inspected; existing page,
form, and sheet owners remain intact, and RTL has no horizontal overflow.
Candidate evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-client-token-localization-20261120/candidate/`;
matching native comparison, bundled visual checks, and an external client
round trip remain open.

### Linked accounts increment

Account Settings now lists local password availability, the linked media
server, and linked identity providers. Users can link Jellyfin or Emby via
credentials where allowed and confirm unlinking through native endpoints.
Unlink controls require another sign-in method and respect the primary
administrator media-server restriction. The server rechecks both rules.

Headed Chrome at 1440 × 1000 verified standalone Jellyfin linking and
unlinking against synthetic responses, including account refresh and cleared
credentials. Plex and OIDC linking, Jellyfin Quick Connect linking, live
providers, and mobile, bundled and native visual comparisons remain open.

### Plex and Quick Connect linking increment

Linked Accounts reuses Lumen's Plex PIN and Jellyfin Quick Connect provider
authorization. Completion calls the signed-in user's existing linking
endpoint. The provider attempt can be canceled and is aborted on page exit.
The Quick Connect option is available on Jellyfin, including installations
that require Quick Connect.

Headed Chrome at 1440 × 1000 verified the standalone Quick Connect-only
branch and account readback against synthetic data. Plex popup completion,
live integrations, OIDC linking, and mobile, bundled and native visual
comparisons remain open.

### OpenID Connect linking increment

Linked Accounts can initiate authorization with a configured identity
provider and complete the link under the same signed-in account. The server
admits the exact standalone and bundled Lumen callback paths on the
configured Application URL origin. Lumen matches the provider response to
the tab's attempt and removes callback parameters before processing.

Headed Chrome at 1440 × 1000 verified a standalone synthetic provider
round trip, one callback submission, clean URL, and linked account readback.
The native route test verifies same-origin admission for both exact Lumen
callback paths and continued rejection of unrelated destinations. Live
providers, Apple form-post completion, mobile, bundled browser execution,
and Lumen's unauthenticated OIDC sign-in remain open.

### OpenID Connect sign-in increment

Lumen's signed-out screen displays configured identity providers and uses
the existing server authorization and callback endpoints. It restores the
requested same-origin route with its query and fragment. Bundled Lumen
uses the exact additional `/lumen/login` callback path.

Headed Chrome at 1440 × 1000 verified the standalone synthetic sign-in
round trip and restoration of a Requests deep link with query and fragment.
The native route test verifies the bundled callback allowlist. Real
providers, Apple form-post, and bundled and mobile browser checks remain open.

### Personal TV request settings increment

Account Settings exposes previous-season watch requirement approval,
cancellation, and approved enable/disable transitions through the existing
account endpoints. Episode Queue shows the current account default and
lets user managers change it with confirmation. Global policy and manager
bypass remain visible.

Headed Chrome at 1440 × 1000 verified a standalone approval request and a
two-episode default save with synthetic readback. Delegated user management,
per-request Episode Queue, live playback, and native, mobile and bundled
visual checks remain open.

### Per-request Episode Queue increment

User managers can set an individual eligible TV request to inherit its owner's
default, turn the queue off, or queue one through five episodes ahead. Request
rows identify active queues and automatically queued child requests.

Headed Chrome at 1440 × 1000 verified a pending TV request in the standalone
Everyone tab with synthetic API data, including a save from the owner's default
to two episodes ahead and readback after navigation. Native visual comparison,
mobile, bundled, delegated-role and live playback checks remain open.

### Local password recovery increment

Lumen offers a recovery link from local sign-in when email is enabled and
allows the user to set a new password from the emailed link. Both forms use
the existing authentication API. The standalone companion serves
`/resetpassword` directly when the Application URL points there. SeerrNG
routes incoming recovery links to bundled Lumen when selected, honoring
the native preference when allowed. Recovery links on the SeerrNG origin
keep using that origin for externally configured frontends.

The logged-out forms now follow the browser's supported language without
requesting account settings. Their labels, actions, completion messages, and
429/503 errors are localized in French and Arabic; Arabic sets the document
direction to RTL. Fixture-backed browser checks cover local password-match
validation, translated rate-limit and mail-unavailable errors, successful
reset, and the privacy-preserving recovery response. Eight cases passed across
desktop, iPhone, Android, and tablet using standalone production preview.

Baseline English request and confirmation forms were captured before the
localization change at 1440 × 900 and iPhone CSS 390 × 664. Candidate French
request and Arabic confirmation forms were captured at 1440 × 900, iPhone
390 × 664, Android 412 × 915, and tablet 834 × 1194. Rendered screenshots
were inspected against the baseline for card geometry, control alignment,
text wrapping, direction, and overflow; strings wrap naturally and no
horizontal overflow was found. Evidence is retained in
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-reset-password-localization-20261120/`.

The synthetic API does not verify live SMTP delivery or production password
reset behavior. Headed native-matched and bundled-browser comparison,
delegated account behavior, live SMTP, and end-to-end recovery remain open.

### Local sign-in localization increment

Signed-out Lumen login now follows the browser's supported locale without
requesting user settings. The entry page, local email form, Jellyfin credential
form, Quick Connect instructions and actions, forgot-password link, configured
OIDC action, known authentication errors, and offline retry state use stable
locale IDs. Known error codes are translated while unrecognized provider
messages remain available to the user. French and Arabic use human-written
overrides, and Arabic sets RTL direction.

Sixteen fixture-backed browser cases passed across desktop, iPhone, Android,
and tablet. They verify French local sign-in failures and 429 handling, Arabic
Jellyfin-to-email mode switching, RTL, a translated OIDC action, offline retry,
and that signed-out routes never request account locale settings. The English
baseline and French/Arabic candidate login screen were rendered with matching
synthetic server configuration at desktop (1440 × 900), iPhone (390 × 664 CSS
pixels), Android (412 × 915), and tablet (834 × 1194). Matched
baseline/candidate renders were inspected at every viewport for card geometry,
button sizing, wrapping, RTL alignment, and overflow. A regression check compares document
width to the emulated viewport width, catching a French-label overflow that the
initial window-width check missed; the shorter French action label now fits.
No layout styles changed. Evidence is retained in
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-login-localization-20261120/`.

Live Plex/Jellyfin, Quick Connect approval, OIDC callback, actual credentials,
and the SeerrNG Express mount remain unverified. The freshly built production
bundle was also served under `/lumen/`; the same 16 fixture cases passed there,
including mounted forgot-password routing. Other locales use the English
fallback; independent linguistic review and localization of other routes
remain open.

### Request retry increment

Lumen offers retry on personal and Everyone request rows using the current
lifecycle stage, requester identity, media permission, and retry eligibility.
Request managers can also reapply an eligible Episode Queue start. Failed
rows explain the server's bounded dispatch and TVDB failure reasons. A
TVDB season mismatch requires manual recovery in native SeerrNG.

Headed Chrome at 1440 × 1000 verified the standalone personal request list
using a synthetic API. An eligible TV request changed from Failed to
Searching after Retry. An owner season mismatch and another user's request
both lacked the Retry action. Native baseline comparison, 4K quality paths,
and live service checks remain open.

The browser matrix now covers owner retry for movie, series, music, book,
comic, magazine, sports and adult failures, plus denial for missing type
permission, another requester, and the TVDB season mismatch. All eight cases
pass on desktop, iPhone, Android and tablet in standalone and bundled Lumen.
4K-specific quality permission and live service recovery remain open.

The large-series episode picker now has bundled-mount qualification as well as
its standalone regression. A 15-season series was opened from an episode deep
link; the first season-metadata response failed, Retry loaded that season, and
the selected episode remained in scope. The full TV request-state browser file
passes 60/60 across desktop, iPhone, Android, and tablet on the freshly rebuilt
embedded asset at an isolated Express static `/lumen/` mount. API responses are
fixtures, so live TV metadata, authenticated middleware, and matched native
visual acceptance remain open. Results are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-general-localization-20261121/tv-request-state-bundled-results/`.
The two dedicated large-series cases were rerun on main commit `07436f3c3`
against the current standalone production build on 2026-11-24: bounded 15-season
loading, transient batch retry, and selection recovery passed 8/8 across desktop,
iPhone, Android, and tablet. This confirms the fixture-backed recovery in the
current build, not live provider availability.

### Request history increment

Lumen request rows open the latest lifecycle events and current stage from
SeerrNG's permission-checked request detail endpoint. Events show timestamps,
retry attempts, and recorded messages. The UI marks truncated histories and
uses the existing sheet, list and error controls.

Standalone Chrome at 1440 × 1000 verified a personal TV request with two
events across two attempts, newest first, and dismissal with Escape.
Native visual comparison, mobile, bundled, delegated browser verification,
and the software-request and download-file history workflows remain open.

The Lumen history sheet was also checked at 620 × 803, the viewport used by
the native request-dialog sizing report. A browser regression exercises a TV
request with a selected season and eight long lifecycle events, verifies the
sheet stays within the viewport and scrolls its own contents, and captures the
settled render. At this width the layout is intentionally a full-width bottom
sheet rather than a centered dialog. No Lumen style change was needed. Evidence
is retained in
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-history-layout-20261120/`.
This checks the Lumen history surface; it does not replace the native request
dialog's baseline/candidate comparison or cover other Lumen sheets.

The history sheet now follows the saved Lumen locale for its title, progress and
stage labels, season and episode summaries, dates, status actions, and request
actions. Existing SeerrNG locale catalog entries are reused where available;
Lumen-specific copy has verified English, French, and Arabic overrides. Locale
coverage was checked on desktop, iPhone, Android, and tablet. Baseline and
candidate renders were compared at 1440 × 900 and the iPhone 13 viewport, with
Arabic RTL and the prior French layout inspected. All 12 locale/viewport cases
passed, as did the 4-case 620 × 803 containment regression and the request-status
and permission matrix passed all 176 cases after updating the accessible-name
assertions to match the localized shared-catalog title.
Provider-supplied lifecycle messages remain as returned by the service. Other
request and software-history copy, live provider handoff, and bundled/native
visual comparison remain open.

### Request file downloads increment

Request History offers an on-demand file lookup for available movies, series,
books, comics and magazines. It displays partial provider results and uses
SeerrNG's existing authorized download endpoints for each file.

Standalone Chrome at 1440 × 1000 verified the ebook file list, partial-source
notice and successful attachment response with a synthetic provider result.
Native comparison, mobile, bundled, live provider and media-detail download
entry points remain open.

### Reader detail downloads increment

Book, audiobook, comic edition and magazine details can look up the signed-in
user's available requests using the exact stored media ID. The picker keeps
ebook and audiobook files separate even when the request covers both. Multiple
matching requests can be inspected individually using the shared file list.

Standalone and bundled Chrome verified book, comic and magazine detail
entry points across desktop, iPhone, Android and tablet projects. Synthetic
responses include another user's request, another media ID and an
audiobook-only request. Only the matching request is queried for files; the
book picker returns its ebook and excludes the audiobook, while comic and
magazine links use their exact request and file IDs. Native visual comparison
and live provider verification remain open.

### Request deep links increment

Lumen opens request history from `/requests?requestId=…` and from the
`/requests/status` alias used by notifications, including requests absent
from the current list. Bundled Lumen preserves the request ID when it is the
selected or enforced frontend. Authorization stays with the existing
request history endpoint. Closing history preserves the selected tab.

Standalone Chrome at 1440 × 1000 verified the notification alias with an
empty request list, an authorized history, Escape dismissal, and a 403
response with no history or files. Server tests cover bundled redirects,
classic preference, invalid or duplicate IDs, and the frontend lock. Software
request management from a focused notification link is covered by the
cross-deployment role/action suite below.
The focused request-status suite now passes on desktop, iPhone, Android, and
tablet against both standalone Lumen and the production Express `/lumen/`
mount. Native visual comparison for this request-history sheet remains open.

The focused request link also preserves owner cancellation when the request is
absent from the current list. A browser regression confirms the title resolved
from request media appears in the confirmation and the exact request is deleted
after confirmation. This case passes on desktop, iPhone, Android, and tablet;
the remaining action and role matrix is still open.

A request manager can also approve a pending request from a focused link when
the request is absent from the loaded list. The four-viewport regression
verifies that approve and decline are offered to the manager, approval targets
the exact request, and the refreshed history reflects the new state. This
closes the direct-link approval case; the broader request action and role
matrix remains open.

### Software request history increment

Software request rows and `softwareRequestId` notification links open the
permission-checked status, event history, and available files or bundle for
the exact request. The bundled frontend redirect preserves software IDs
separately from media request IDs.

Standalone Chrome at 1440 × 1000 verified a direct software notification
link, its history and download choices, and a missing request response. Server
routing tests cover the bundled redirect. The cross-deployment role/action
matrix now covers focused links across all four browser viewports.

The software-history sheet now follows the saved locale for its title, known
lifecycle states, permission-eligible actions, download heading, history dates,
and error fallback. It reuses SeerrNG's translated catalog entries for those
labels; Lumen-specific selection details and confirmation wording have English,
French, and Arabic overrides. Existing owner, manager, provider-capability, and
uncertain-download confirmation checks remain in force. The localized candidate
and prior English sheet were rendered with the same fixture at 1440 × 900 and
the iPhone 13 viewport; French and Arabic desktop/phone renders were inspected,
and all 12 locale/viewport assertions passed. The full software-history action
suite passed all 40 cases in standalone and all 40 in a fresh production build
served from an Express `/lumen/` mount, across desktop, iPhone, Android, and
tablet. Unique Lumen confirmation copy falls back to English in other supported
locales. Native-matched visual comparison, live-provider behavior, and
independent linguistic review remain open. Results and captures are retained
at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-software-history-bundled-20261121/`.

### Software request actions increment

Software Request History offers approval, decline, withdrawal, cancellation,
retry, stop tracking, and clearing cancelled history based on ownership,
permission, request state, and provider capabilities. When the server cannot
confirm a previous handoff, retry or cancellation waits for the user to check
the download queue and history and explicitly confirm there is no match.

Browser fixtures across desktop, iPhone, Android, and tablet verify owner,
request-manager, and view-only permissions across approval, decline,
withdrawal, retry, cancellation, stop tracking, and clearing cancelled
history. Retry and cancellation send a no-existing-download confirmation only
after a synthetic 409 makes provider state uncertain. Each state passes a
no-horizontal-overflow check at all four presets. The uncertain-retry sheet
was rendered and reviewed on iPhone; its message and confirmation buttons stay
within the view. The 40-case suite now passes on both standalone and bundled
`/lumen/` builds across desktop, iPhone, Android, and tablet. It also verifies
that uncertain cancellation asks users to check the download queue and
history, sends no confirmed cancel until they explicitly confirm, and then
submits the confirmation flag. Native visual comparison,
administrator-specific variants, and live provider behavior remain
unverified. Evidence is retained in
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-software-history-bundled-20261121/`.

### Household software requests increment

Everyone has a paginated Software filter for viewers with household request
visibility. Rows show requester, platform, and lifecycle status and open
the software-specific history and management controls.

Standalone Chrome at 1440 × 1000 verified requester attribution, loading
page two, reaching moderation as a delegated request manager, and preserving
the Software filter after closing history. Native and mobile visual comparison,
bundled browser execution, view-only roles and live providers remain open.

### Household software filters increment

Everyone → Software now filters by software category and lifecycle status
through the existing server query. Both filters can be bookmarked and changing
either resets pagination.

Standalone Chrome at 1440 × 1000 verified a bookmarked Retro games and Failed
view, keyboard selection of Modern games, and the refreshed result with Failed
retained. Native visual comparison, mobile, bundled and live provider checks
remain open.

### Household requester filter increment

The Everyone tab can scope both media and software lists to a requester
from the permission-checked, paginated user directory. The filter persists
when changing request type, and scoped requests use the same owner in the
initial and progress queries. Household-wide badge counts are excluded from
scoped filter chips.

Standalone Chrome at 1440 × 1000 verified loading the second user page,
selecting a requester by keyboard, and retaining that requester when switching
from Software to Waiting. Mobile, bundled, native visual comparison and
live-provider checks remain open.

### Household request media filter increment

The Everyone tab can filter requests by media type alongside status and
requester. The media filter is bookmarkable, applies to both list and progress
queries, and only shows the Adult option to eligible viewers.

Standalone Chrome at 1440 × 1000 checked an Available view scoped to one
requester, switched Movies to Series by keyboard, and checked the resulting
series view. The read-only fixture showed neither Adult nor moderation
controls. Native visual comparison, mobile, bundled and live providers
remain open.

### Request date filter increment

Everyone media requests support the native date ranges of 7, 14, and 30
days and six months. Scoped lists and progress use the lifecycle endpoint.
If that endpoint is unavailable, Lumen shows an error and preserves the
selected date range.

Standalone Chrome at 1440 × 1000 verified a bookmarked seven-day Waiting
and Movies view and a date-specific backend error after selecting 14 days.
Mobile, bundled and native visual comparison remain open.

### Household book format filter increment

The Everyone media list filters Books and audiobooks by Ebook or Audiobook.
The lifecycle API provides pagination and includes requests covering both
formats in either selection. The format is bookmarkable and clears when
switching to a non-book media type.

Standalone Chrome at 1440 × 1000 verified a bookmarked audiobook filter
and a keyboard switch to ebooks against synthetic data. Native visual
comparison, mobile, bundled and live providers remain open.

### Household request search increment

The Everyone media list can search server-side across the current status,
requester, type, format and date filters. Search terms are bookmarkable and
apply before pagination. Clearing search retains the other filters.

Standalone Chrome at 1440 × 1000 submitted a term containing an ampersand,
verified the matching synthetic request, and cleared search while retaining
Waiting. Native visual comparison, mobile and bundled checks remain open.

### Household request sorting increment

Everyone media requests can sort across pages by date added, last update or
title. The default Request Priority option retains pending and active download
prioritization. Other options follow the server's order and are bookmarkable.

Standalone Chrome at 1440 × 1000 verified a bookmarked Oldest first movie
view and switched it to Newest first by keyboard, reversing the fixture rows
and retaining the media filter. Native visual comparison, mobile, bundled and
other sort options remain unverified.

### Household lifecycle filters increment

Everyone media requests have Incomplete, Needs attention, Unavailable and
Completed views. These use the existing lifecycle endpoint before pagination,
including its treatment of partially available series with ongoing downloads.

Standalone Chrome at 1440 × 1000 showed a partially available series
downloading in Incomplete and confirmed the Unavailable and Completed
responses against fixtures. Mobile, bundled and native comparison remain open.

### Focused request progress increment

Request History shows the current service, download percentage and size,
download count, estimated completion, and pending book import attempts when
the exact request supplies those values. Refresh Status reloads the snapshot.

Standalone Chrome at 1440 × 1000 verified the ebook import retry details
and a refresh from 50% to 75% and 1 GiB to 1.5 GiB of a 2 GiB download.
Native visual comparison, mobile, bundled and live providers remain open.

### Focused request action increment

The media history dialog reuses request row actions with the exact request
and current lifecycle snapshot from the server. Direct links work even
when the request is absent from the list. Confirmations and edit sheets
replace the history dialog while open and completed actions refresh it.

Standalone Chrome verified a delegated manager declining a request absent
from the list, including confirmation and a refreshed Declined state.
Other actions, mobile, bundled and native visual comparison remain open.

### Focused request title increment

Direct request history links resolve the title through the shared request
metadata lookup after the exact request has loaded. The ID remains visible
while waiting or when metadata cannot supply a title.

Standalone Chrome at 1440 × 1000 verified that a direct link resolved a movie
title while the underlying Requests list was empty. Native visual comparison,
mobile, bundled and other media categories remain unverified.

### Personal email notifications increment

Account Settings opens Notification Settings with the email event choices
when email is enabled. It saves the email mask through the existing personal
settings endpoint and preserves other notification channels.

Standalone Chrome at 1440 × 1000 verified opting out of Media available,
the email-only write, and persisted readback after navigation. OpenPGP,
other channels, live delivery, mobile, bundled and native visual checks
remain open.

### Personal OpenPGP settings increment

Notification Settings lets users add, replace, or remove the armored public
key for notification email. The independent form saves only the public key
and asks for confirmation before removal.

Standalone Chrome verified a synthetic armored public-key save and confirmed
removal through a fixture that accepted only key changes. Live encryption
and delivery, native comparison, mobile and bundled checks remain open.

### Personal Telegram notifications increment

Notification Settings supports Telegram chat and forum topic IDs, silent
delivery, and notification events when Telegram is enabled on the server.
The Telegram form sends only Telegram settings.

Standalone Chrome verified a negative group chat ID, a topic, silent
delivery and Media available preferences against a synthetic endpoint.
Live bot delivery, native visual comparison, mobile and bundled checks
remain open.

### Personal Discord notifications increment

Notification Settings supports personal Discord mention IDs and event
preferences when mentions are enabled. The form shows server-enabled events
and sends only Discord fields.

Standalone Chrome verified a synthetic save of two Discord IDs and the single
event enabled by the fixture. Live delivery, native visual comparison,
mobile and bundled checks remain open.

### Personal Pushbullet notifications increment

Notification Settings supports Pushbullet access-token replacement, removal,
and event preferences. Event-only saves omit the token field. Removing the
token explicitly clears the Pushbullet event selection.

Standalone Chrome verified an event-only save with a redacted stored token
and a separate removal write against a synthetic endpoint. Live delivery,
native visual comparison, mobile and bundled checks remain open.

### Personal Pushover notifications increment

Notification Settings supports Pushover credentials, sounds and event choices.
Sound and event changes omit untouched credentials. Explicit removal clears
the credentials and disables Pushover events.

Standalone Chrome selected a sound and enabled an event. The synthetic
endpoint accepted only the sound and event fields and returned the saved
values on readback. Live delivery, mobile, bundled and native comparison
remain open.

### Browser push settings increment

When enabled on the server, Notification Settings supports browser push event
preferences and listing and removing registered devices. Removal is scoped to
the current account and confirmed before the server subscription is deleted.
Lumen browser registration now has fixture-backed browser coverage on desktop, iPhone, Android, and tablet in standalone and bundled deployments. Real subscription and live delivery on a secure browser remain open.

Standalone Chrome verified device removal against a synthetic API, with an
empty device list on API readback. Mobile, bundled and native visual checks
remain open.

### Browser push registration increment

Lumen registers a push worker in an account-specific scope outside its app
pages. The standalone cleanup targets the legacy root worker and preserves
the new registrations. Bundled Lumen leaves the native root worker alone.
Notification clicks validate the destination and preserve supported request
links under the appropriate frontend base.

Worker tests verify notification display arguments, request link resolution
in both deployment layouts, and rejection of cross-origin and ambiguous
navigation targets. Browser registration tests verify granted and denied
permission, account-specific worker scope and script, exact subscription keys,
and server readback across four viewports and both deployments. Real browser
subscriptions, live delivery, and native visual comparison remain open.

### Current browser push device increment

Lumen matches the current account's dedicated browser registration to the
server device list. It labels the matching device and allows disabling it.
Confirmed removal clears the server subscription first, then unsubscribes the
local browser only when its account, worker and endpoint match.

An isolated test verified that disabling one browser does not unsubscribe a
different endpoint, another account's worker or the native worker. Secure
browser interaction, mobile installation and live delivery remain open.

### Personal notification localization increment

The personal notification route and registered browser-device controls now
follow the account locale. SeerrNG's notification catalog supplies translated
channel fields, event labels, validation and save/removal feedback; Lumen's
English, French and Arabic overrides cover its browser-device guidance and
status messages. Save operations continue to write only the selected channel,
and device removal remains confirmed and scoped to the signed-in account.

Fixtures verify email event-only saves, OpenPGP key save/removal, Telegram
forum-topic saves and browser-device deletion in desktop, iPhone, Android and
tablet profiles. French and Arabic baseline/candidate screenshots cover the
same widths. Live provider delivery, real secure-browser subscriptions,
bundled `/lumen/` rendering and native visual comparison remain open.

### Personal discovery preferences increment

Account Settings exposes Discover Region, Streaming Region and Original
Language through the existing profile endpoint. Clearing a field restores
the server default preference. The form sends only changed fields.

Standalone Chrome verified normalization, clearing a region and API readback.
The current discovery backend uses Streaming Region and Original Language
in its query. Runtime use of the separate Discover Region field, native
visual comparison, mobile and bundled verification remain open.

### Discover Region query correction

An explicit personal Discover Region now determines the region in Discover
queries used by Lumen and native SeerrNG. All regions removes the region
constraint. With no override the previous Streaming Region fallback and
server default still apply. Movie feed cache keys use the same region as
the query, and Discover Home revisions include the preference.

The route regression test verified the exact TMDB region for an override,
All regions and the streaming fallback. Live TMDB and rendered comparison
remain unverified.

### Coming Soon quick-request error localization (2026-11-24)

Coming Soon's direct movie quick-request failure now passes server-provided
error codes and fallback text through Lumen's active locale translator. The
request payload, permission checks, and existing recovery behavior are
unchanged.

The focused failure-state browser regression passes in English, French, and
Arabic on desktop and iPhone. The pre-fix baseline reproduces English fallback
copy in French and Arabic on both device profiles. Matched desktop captures
use 1440x900 pixels; iPhone captures use a 390x664 CSS viewport. Only the
status message changes. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-quick-request-error-localization-20261124/`.
The standalone Lumen client was verified; live request-provider behavior and
the production Express `/lumen/` mount remain unverified.

### Personal streaming subscriptions increment

Account Settings lets users search and save streaming subscriptions from the
combined movie and series provider catalogs. It uses the saved personal or
server streaming region and preserves selected IDs absent from the catalog.
The save only changes the subscription list.

Standalone Chrome verified region-scoped catalog loading, provider search,
and saving a new selection while retaining an existing ID absent from the
fixture. Bulk selection, live policy effects, mobile, bundled and native
visual comparison remain open.

### Streaming subscription bulk actions increment

Select Shown and Clear Shown update the visible providers in the subscription
draft. The search limits both actions and hidden selections stay intact
until changed explicitly. They use the same save and provider count limit
as individual selections.

Standalone Chrome verified both actions with a search active. The fixture
readback confirmed the new matches and retained both a hidden provider and
an existing ID missing from the source catalog. Mobile, bundled and native
visual comparison remain open.

### Personal watchlist auto-request preferences increment

Account Settings exposes the six native watchlist auto-request preferences
through the existing profile form. Movie and series controls require a Plex
account. All six follow native automatic-request permissions. The form
sends changed fields only and preserves explicit false values.

Standalone Chromium fixtures passed profile save and retry flows, including a
failed watchlist-preference save that retains the draft and succeeds on retry.
They verified that a non-Plex user with movie and music permission can turn
off music auto-requests without seeing the Plex movie or ungranted book control.
The exact false value persisted through page reload at desktop, iPhone,
Android and tablet viewport presets. The fixtures also surfaced a provider
response shape that could crash Account Settings, which is now handled.
An expanded permission matrix passed 24 standalone browser cases across
desktop, iPhone, Android and tablet: no auto-request permission, movie-only
permission for a Plex member, music-only permission for a local member, the
global auto-request permission, local administrator, and Plex administrator.
It verifies category visibility, Plex-only controls and email editability.
Live automatic requests, the remaining account-settings role/save cases,
bundled behavior and native visual comparison remain open.

### Personal card title preferences increment

Account Settings uses SeerrNG's Card Titles endpoint for movie, series,
album and book preferences. Shared posters consume the signed-in user's
settings without a per-card request. On hover-capable devices, the hover
mode reveals the title on pointer or keyboard focus and reserves its space
in the grid. Touch devices and cards without artwork keep the title visible.

Standalone browser fixtures cover default settings, a movie preference
change, exact changed-category submission and poster rendering across desktop,
iPhone, Android and tablet presets. The native per-list toggle, bundled
verification and matching native visual comparison remain open.

### Browsing card title toggle increment

Title View is available in the movie and series filters, Music, Books and
Audiobooks, relevant Search scopes, and Discover shelves that use the
shared poster titles. It uses the same account preference as the settings
form. A mixed-media toggle sends one update for the categories that change.
The existing heading row can wrap when it contains a title toggle.

The standalone Movies fixture verified a saved change, a failed toggle that
keeps the current value, and a successful retry that applies without a page
reload. Desktop and touch viewport presets passed. The remaining screens
need rendered checks, along with bundled and native visual comparisons.

### Video credits disclosure increment

Movie and series details expose cast and crew through the shared disclosure
surface. These panels follow SeerrNG's per-media pins and honor legacy
movie pins when a scoped value is absent. A save changes only the chosen
pin. Opening or closing a panel by hand does not change the saved pin.

Standalone browser fixtures verified a scoped false override, a failed
movie cast save and retry, persisted open state after reload, independent
series state, and access to crew credits. The checks ran at desktop,
iPhone, Android, and tablet presets. Bundled and native visual comparison
and the remaining detail disclosures are open.

### Video subject tags increment

Movie and series details expose subject tags through the shared pinned
disclosure. Visibility inside the panel follows native SeerrNG's per-user
browser preference. Tag links open Lumen's corresponding discovery grid
with the keyword filter active and a control to clear it.

Standalone desktop, iPhone, Android and tablet fixtures verified movie to
series visibility persistence, the exact filtered discovery query, clearing
the filter, and the existing credit pin behavior. Bundled and native visual
comparison and live provider results remain open.

### Complete video credit lists increment

Movie and series credit panels show character and job names and link
confirmed TMDB people to Lumen's person pages. The first ten credits are
shown initially. The remaining credits can be expanded or collapsed.

Standalone desktop, iPhone, Android and tablet fixtures verified the
eleventh credit, visible character name, collapse, navigation to the
matching person page, and retained pin and subject-tag behavior. Bundled
and native visual comparisons remain open.

### Person filmography increment

Lumen person pages show separate cast and crew groups without the previous
24-title cap. Movie and series filters and ten sort orders apply to both
groups. Duplicate role names are grouped by media type and catalog ID.

Standalone fixtures verified 27 distinct cast titles, merged character
names, a crew role, natural title ordering, missing vote counts, series
filtering, and distinct movie and series links for the same numeric ID.
Desktop, iPhone, Android and tablet presets passed. Bundled and native
visual comparison and the native bulk-request action remain open.

### Person bulk movie request increment

Person pages expose Request All Movies when enabled by the instance and
allowed for the signed-in user. The confirmation counts unique movie IDs
across cast and crew and uses the native person-movies endpoint in batches
of up to 100. It stops on a server stop or unconfirmed outcome and reports
submitted, skipped, failed, unconfirmed and unsent counts as applicable.

Standalone fixtures verified cancellation without writes, two exact
100-title batches from 205 unique movies, exclusion of a TV credit and a
duplicate, and stopping before the final batch on quota. Desktop, iPhone,
Android and tablet presets passed. Instance-side configuration in Lumen,
bundled and native visual comparison, and live writes remain open.

### Person bulk request instance setting increment

Lumen administrators can enable or disable person-page bulk movie requests
under Instance Request Settings. The form reads the public flag, submits
only the changed flag to SeerrNG's admin endpoint, and confirms the stored
value. Its save is independent of Lumen appearance configuration.

Standalone browser fixtures verified failed-save recovery, explicit true
and false payloads, a second save without reloading, and non-admin denial.
The adjacent bulk-request workflow also passed at desktop, iPhone,
Android and tablet presets. Live instance writes, bundled and native
visual comparisons, and the broader administration surface remain open.

### Instance video request policy increment

Lumen's instance request form manages the global 4K switch, partial series
requests, special episode requests, and previous-season watch requirements
alongside person-page bulk requests. Saves send only changed policy flags.
Series details include season zero in the request picker when enabled.

Standalone browser fixtures verified a multi-field save with explicit false
values, failed-save recovery, and specials appearing after the administrator
enables them. Desktop, iPhone, Android and tablet presets passed. Individual
episode availability tracking configuration, live playback enforcement and
bundled and native visual comparisons remain open.

### Episode file availability increment

Lumen administers individual episode availability tracking with the native
instance flag. Series details show an on-demand season panel when tracking
is enabled. It uses the existing viewer-filtered season endpoint and
displays reported source and quality, including the older Sonarr response.

Standalone desktop, iPhone, Android and tablet fixtures verified no season
read before expansion, Plex HD, absent reports, and a season change to
legacy Sonarr 4K. Live provider scans and bundled and native visual
comparison remain open.

### Previous-season watch rule feedback

Series details show when the watch rule may apply. A structured SeerrNG
rejection keeps the selected seasons intact and displays the server's reason
beside the picker. A missing playback account links to Linked Accounts.
Standalone browser fixtures verified the exact rejected season, retained
selection, recovery link, and clearing the message on selection change
across desktop and three touch presets. Live playback and bundled and
native visual comparisons remain open.

### Whole-series request confirmation

Series details preserve whole-series intent when the instance disables
partial requests, even when some seasons are already available. The
confirmation reports the seasons returned by SeerrNG. Standalone browser
fixtures verified the exact request and confirmation on desktop and three
touch presets. Live playback and bundled and native visual checks remain open.

Quick series requests from posters, featured cards, the options sheet and
Coming Soon share the details confirmation formatter. It lists the server's
accepted seasons and gives a neutral submission message when none are
returned. Standalone browser fixtures verified poster and detail requests
on desktop and three touch presets. Featured, Coming Soon, options-sheet
and bundled visual checks remain open.

Coming Soon now has standalone browser coverage for both the direct request
and the 4K options sheet. Both send whole-series intent, display the season
accepted by SeerrNG, and preserve the selected quality in the confirmation.
The checks passed at desktop, iPhone, Android and tablet presets. Featured
cards and visual comparison with the bundled and native interfaces remain open.

The Discover featured-series action now has standalone browser coverage for
a watch-rule rejection and retry. Both attempts preserve whole-series intent,
and the successful retry reports the accepted season. Desktop, iPhone,
Android and tablet presets passed. Bundled and native visual comparisons
remain open.

Coming Soon now identifies failed movie or series feeds independently and
retries the affected feed while keeping successful results visible. The
standalone browser fixture verified a series-only failure and recovery on
four viewport presets. Bundled and native visual comparisons remain open.

The Coming Soon route now localizes its title, intro, media scope, month
headings and day labels, item media type, request button, direct movie request
toast, and locally submitted status in English, French, and Arabic. Twelve
fixture cases passed across desktop, iPhone, Android, and tablet, including the
exact movie request payload. The existing Coming Soon title/request suite
passed nine cases with three expected desktop-only skips. French iPhone and
Arabic desktop/iPhone renders were reviewed; no overflow or card geometry
changes were needed. Request-option sheets, series confirmation copy, provider
statuses, bundled production mounting, and native-matched visuals remain open.

### Video genre exclusion

Movie and series grids expose genre exclusion through SeerrNG's discovery
query. The selection is shareable through the URL and clears with All genres.
Standalone movie fixtures verified the query, reload and reset across four
viewport presets. Series-specific, bundled and native comparisons remain open.

### Video rating bounds

Movie and series grids support minimum and maximum TMDB ratings in tenths.
The applied bounds use server discovery queries and persist in the URL.
Standalone series checks covered reversed bounds, exact query parameters,
reload, and clearing the bounds while preserving genre exclusion. Four
viewport presets passed. Bundled and native visual comparison remains open.

### Streaming provider discovery filters

Movie and series grids support including or excluding selected streaming
providers by region. The filter uses SeerrNG discovery queries and retains
the selection and region in the URL. It defaults to the instance streaming
region, with US as the fallback. The standalone Series fixture verified
multiple provider IDs, region normalization, exclusion, reload and reset
across four viewport presets. Live provider results and bundled and native
visual comparisons remain open.

Shared movie and series discovery URLs now preserve included and excluded
subject-tag lists. Clearing the tag filter keeps adjacent filters intact.
Eight standalone browser checks covered both shared lists and the existing
detail-to-discovery tag link. Movies and Series also offer interactive
subject-tag search through SeerrNG's keyword endpoint. Users can include,
exclude, move, and remove tags while preserving other filters. Standalone
browser checks verified the Movies interaction and shared links at four
viewport presets. Live keyword results and bundled and native visual
comparisons remain open.

Subject-tag search follows the native keyword endpoint's pagination contract.
Standalone browser checks verified reaching page two, returning to page
one, and retaining selected tags across pages. Live searches and bundled
and native visual comparisons remain open.

Series discovery can filter by status or exclude the chosen status. The
standalone browser fixture verified the returning-series status, the exact
exclusion query, reload persistence, and reset while preserving the genre
filter across four viewport presets. Bundled and native visual comparison
remains open.

Movies and Series now expose release-date bounds, using primary release
dates for movies and first-air dates for series. The standalone fixture
verified reversed-range validation, exact Series query bounds, reload, and
independent reset across four viewport presets. Movie live results and
bundled and native visual comparisons remain open.

Movies and Series now support runtime bounds in minutes. The standalone
Movie fixture verified the exact server bounds, reload and independent
reset across four viewport presets. Existing release-date and rating
checks also passed. Live results and bundled and native visuals remain open.

Movies and Series now support TMDB vote-count bounds. Explicit bounds
override the Top rated default and clearing them restores that default.
Standalone checks covered the Series query, reload, reset and adjacent
range filters across four viewport presets. Bundled and native visual
comparisons remain open.

Movies and Series now expose original-language filtering using SeerrNG's
language catalog. An explicit All Languages selection differs from leaving
the parameter unset for the saved default. Four standalone Series checks
covered selection, reload, the explicit All Languages query, and reset.
Live provider and bundled and native visual comparisons remain open.

Movies and Series accept a country-of-origin filter. The picker uses
SeerrNG's streaming-region catalog and preserves a valid country code
from a shared link even when absent from that list. Standalone Movies
checks covered the request, reload and independent reset across four
viewport presets. The production-country detail links, live results
and bundled and native visual comparisons remain open.

Movie and series facts list production countries and link them to the
matching discovery grid. Standalone browser checks verified both link
targets and the existing country filter on four viewport presets. Bundled
and native visual comparison remains open.

Series network facts now link to the matching discovery query when a
network has an ID. The grid identifies the active network and can clear
it independently. Standalone checks covered the link, exact query and
reset on four viewport presets. A network catalog picker and bundled and
native visual comparisons remain open.

The Series network picker reuses the native default catalog and retains
network links outside the catalog. Standalone checks covered catalog
selection, exact query, reload, reset and detail links at four viewport
presets. Bundled and native visual comparisons remain open.

Movie production studios link to matching discovery results and can be
cleared from the Movies grid. Standalone checks covered the exact query
and reset, alongside series network links, at four viewport presets.
Interactive studio selection and bundled and native visuals remain open.

Movies now has a production studio picker backed by company search.
Selection and exclusion use the native query contract. Standalone checks
verified searching, selection, exclusion, reload, reset and detail links
across four presets. Bundled and native visual comparisons remain open.

Movies and Series now have one reset action for applied discovery filters.
It preserves unrelated URL parameters, discards range drafts and closes
filter pickers. Standalone browser checks covered reset and adjacent
streaming and studio flows. Bundled and native visual comparisons remain open.

Movie and series discovery now show one retry action when a failed page
leaves the grid empty. Standalone Movies fixtures verified recovery and
retained filter state across four viewport presets. Visual comparisons
with bundled Lumen and native remain open.

Movies and Series can distinguish HD and 4K in the available and unavailable
views when the instance enables 4K. The grid filters viewer-scoped discovery
rows and retains the quality in the URL. Four standalone browser checks
covered both qualities, reload and switching to unavailable. Native
library-first availability queries and visual comparisons remain open.

Available Movies and Series use SeerrNG's library-first query in default
sort order when the selected filters are supported by that query. Catalog
availability filtering remains for unavailable titles and other filters or
sorts. Standalone Movies checks verified the HD and 4K library requests and
the bounded catalog fallback at all four viewport presets. Series and
live backend verification and bundled and native visual comparisons remain open.

Standalone Series fixtures verified that a shared 4K availability link
uses the library query, that a series-status filter switches to the catalog
while retaining 4K filtering, and that clearing status restores library
results. All four viewport presets passed. Live-backend and visual
comparisons remain open.

The shared pagination hook now retries the failed page directly on user
action. It keeps previously loaded titles and no longer depends on the
scroll marker to start the retry. Standalone Movies checks verified initial
and second-page recovery across four viewport presets.

Discover shelves now restore horizontal position per shelf and history entry.
The position cache is bounded and cleared on account change. Standalone
browser fixtures verified movie-shelf restoration after Back at four
viewport presets. Other shelves and bundled and native visual comparisons
remain open.

When an administrator locks non-admin users to bundled Lumen, native movie
and series discovery links now land on the matching Lumen grid. Supported
filters, genre matching, and availability quality are carried forward.
Server integration tests covered studio, network, keyword, genre matching,
invalid identifiers, and existing frontend routing. Browser and companion
deep-link verification remain open.

Bundled Lumen's frontend lock now preserves native movie, series,
collection and person detail links. Server integration coverage verifies
the destinations, identifier bounds, and administrator access to the
native interface. Native detail subpages and browser verification remain open.

### Video credit deep links

The bundled Lumen lock redirects native movie and TV cast and crew links to
the corresponding detail panel. The panel opens and scrolls into view after
the title loads. Viewers can close it without changing their saved pin.

Redirect tests cover all four routes and reject unsupported suffixes and
out-of-range IDs. Standalone desktop, iPhone, Android, and tablet fixtures
verified anchored scrolling, open and close behavior, and preservation of
the saved pin. The bundled sign-in round trip and live visual comparison
remain unverified.

### Related movie and series lists

Movie and series details link to full Recommendations and Similar lists.
Both lists use the corresponding viewer-scoped SeerrNG endpoint and reuse
Lumen's poster grid, pagination, and retry controls. Bundled frontend lock
preserves all four native subpage URLs.

Server redirect tests and standalone desktop, iPhone, Android, and tablet
fixtures passed. Browser coverage includes navigation from movie details,
direct series URLs, correct media links, and retry after a failed second
page. Live provider results and matched visual comparisons remain open.

### Native links to existing Lumen workflows

The bundled frontend lock preserves native links to requests, library,
following, calendar, Coming Soon, profile and supported account settings,
personal watchlist, issues, acquisition tools, search, and supported media
browsing categories. It translates the native search term and supported
search scopes and retains supported personal watchlist and indexer inputs.

Server integration tests cover representative routes, issue ID bounds,
repeated search parameters, and unsupported routes. The earlier statement that
the native Games library and Discover Watchlist needed distinct workflows is
superseded by the dedicated increments below. Live browser validation of the
bundled redirects remains open.

### Discover Watchlist

The personal watchlist links to a separate Discover Watchlist. Discovery
uses the viewer-filtered discovery endpoint, applies the instance's media
category settings, and shares the personal screen's filters, paging, and
local removal. The bundled lock and companion redirect preserve the
native Discover Watchlist link and its supported filters.

The complete 36-case Watchlist suite now passes in standalone and bundled
deployments across desktop, iPhone, Android, and tablet. It covers endpoint
scopes, hidden media categories, filter paging, and personal Watchlist actions.
Server redirect tests and the companion redirect inventory check passed. Live
Plex effects and matched visual comparisons remain open.

### Private and household game libraries

My Games under You opens a private library, independently of the game
catalogue and its provider availability. It supports title, progress and
type filters, paging, manual entries, ownership and progress edits,
opt-in sharing, removal confirmation, catalog links and request history.
Household Games reads the server's shared-only list and can show all shared
games or titles with two or more owners. Bundled native Games bookmarks
open the private library. The companion keeps its existing Games catalogue
URL and offers My Games from You and the catalogue.

The server redirect tests and four standalone viewport fixtures passed.
Browser coverage includes add, edit, owned-only sharing, removal
confirmation, and separate household results. Steam linking and sync,
catalog matching, live deployments and matched visual comparisons remain
open.

### Game library catalogue matching

An unmatched private library entry can search the catalogue for its saved
game category. Selecting an exact catalogue result saves the match and any
pending progress, ownership or sharing edits in one API operation. Results
without an IGDB identity cannot be submitted to the existing match API.

Eight standalone browser checks passed across desktop, iPhone, Android
and tablet. They covered explicit selection, preservation of pending edits,
retry after a failed match, and the existing library workflows. Live
catalogue results and matched visual comparisons remain open.

### Steam library import in My Games

The private library includes Steam linking, import status, sync and
confirmed unlink. Steam returns to the initiating interface using an
allowlisted session value and the configured public URL. The companion
requires its Lumen Public URL. The bundled frontend uses SeerrNG's
Application URL. Game-library reads bypass the persistent frontend cache
so ownership and sharing reflect callback, sync and unlink changes.

Server tests with stubbed Steam assertions verified the native, bundled
and companion callbacks and rejected an arbitrary frontend value. Twelve
standalone browser checks across desktop, iPhone, Android and tablet
covered the simulated link return, sync, unlink and existing library
workflows. Live Steam linking and matched visual comparisons remain open.

### My Games localization

The My Games page now uses Lumen’s locale catalog for its private and
household views, progress and game type labels, manual entry editor, catalogue
matching, Steam linking/sync/unlink states, pagination and accessible labels.
Date formatting follows the selected locale. API paths, read/write payloads,
sharing eligibility and confirmation steps are unchanged.

The browser suite passed all 16 cases in English in both standalone and the
production `/lumen/` mount across desktop, iPhone, Android and tablet. It
covered private edits, sharing, removal confirmation, catalogue match retry,
and Steam sync/unlink, including the bundled callback target. Locale-specific
render and manual-entry form cases passed in English, French and Arabic across
the same four viewports in the standalone build. Baseline and
candidate empty-library captures were compared at desktop and iPhone widths;
French and Arabic candidate captures of the empty state and add-game form
were inspected at desktop and iPhone.
The translated states showed no root horizontal overflow. Mobile add-form checks
scroll the progress control and submit button clear of the fixed tab bar. Evidence
is retained in `/mnt/disks/scratch/task-deliverables/seerrng-lumen-game-library-20261121/`.
Live provider behavior and populated-state visual comparison remain open.

### Companion bookmarks and account notifications

The companion routes existing native profile, notification, media
discovery, Coming Soon, and video credit bookmarks into Lumen. Local
redirects preserve the browser-facing scheme and port. Native bookmarks
for the supported notification channels also work with bundled frontend
lock. Unsupported native workflows continue through the companion's
existing full SeerrNG handoff.

The companion production image test verified redirect status, destination,
query and fragment handling, and the handoff for Discover Patches.
Bundled server tests verified notification routing. These changes reuse
existing screen owners and do not change their layout.

### Patch catalogue discovery

Games links to Translations and Hacks. The Lumen catalogue uses SeerrNG's
ROMarrNG-backed search, with title, kind, language, completion and cursor
filters. It can follow an exact patch project and open the associated
retro game when the catalogue supplies a supported identity. Native patch
discovery bookmarks redirect into both Lumen deployments.

Four standalone viewport checks covered filters, cursor navigation, the
exact follow identity and DAT game links. Bundled redirect and production
companion proxy checks passed. Patch version selection and requests,
exact Following event links, live provider results and matched visual
comparisons remain open.

### Exact-version patch requests

Patch discovery links to a project page for choosing a specific version.
Following updates open that page with their exact version selected. The
request uses the matched catalogue identity and compatible emulation
system, requires the selected version's base revision to be available,
and keeps the original by default. The server still authorizes and admits
the request through its software request endpoint.

Eight standalone browser checks passed across desktop, iPhone, Android
and tablet. The request fixture covers a version-specific Following link,
an unavailable base, and an exact DAT request pending approval. Live
provider submission and matched visual comparison remain open.

Patch requests now link from the submission receipt to software request
history. The request list and history link back to the saved project and
version. History also shows whether the request kept the original. Old
requests made against the provider's latest version link to the project
without claiming a specific saved version.

The standalone patch fixtures passed on desktop, iPhone, Android, and
tablet, including the round trip through software request history. Live
provider history and matched visual comparisons remain open.

### Upcoming movie and series bookmarks

Coming Soon can show both feeds, movies only, or series only. Both
deployments preserve native upcoming movie and series bookmarks. A scoped
entry requests only its selected feed. Bundled route tests and companion container checks passed. The Coming Soon
title and layout suites now pass 14 cases with six expected viewport skips in
both standalone and bundled deployments. They cover selected-feed paging,
streaming and quota confirmations, title wrapping, tablet request-button fit,
and overflow across the accepted widths. Matched native visual and live-provider
comparisons remain open.

### Full video Trending grid

The Discover hero links to a paginated Trending grid with movie, series,
mixed media, daily and weekly scopes. The grid uses media type and ID
together so a movie and series can share a numeric ID across pages.
Native Trending bookmarks preserve video scopes in both deployments.
Native music, book and audiobook scopes open their Lumen browse screens.

Bundled and companion redirect checks and eight standalone browser
checks passed across desktop, iPhone, Android and tablet. The browser
fixtures cover mixed identities, filter queries, and shared pagination
in related video lists. Live results and matched visual comparisons
remain open.

The Trending API attaches availability and active request metadata by
media type and TMDB ID. The route fixture verifies that an available
movie and an in-progress series with the same ID retain distinct server
records in the mixed feed.

Trending collections now open the collection detail page through the
same poster card used by Search. The API keeps collection identities
distinct and follows Search's movie-category and maturity rules.
The featured quick-request hero is scoped to movies and series in both Lumen
and native SeerrNG: native `HeroShelf` consumes the video-only trending API and
renders `HeroCard` for movie/TV results, while Lumen applies the same type
filter and uses `FeatCard`. Books, audiobooks, and other categories use their
own discovery shelves and card request actions. This scope is verified native
parity, not an outstanding Lumen gap.
Twenty standalone Trending and collection checks and two server route
checks passed. Live provider coverage and matched visual comparisons
remain open.

### Public TMDB list pages

Lumen opens native public TMDB list bookmarks with the list name,
description, mixed movie and series posters, and URL-backed pagination.
It uses the existing viewer-filtered list endpoint. Invalid list IDs are
rejected, and a failed page can be retried without resetting the page.

Bundled and companion redirect checks and four standalone viewport tests
passed. The browser fixture covers exact media links for a shared numeric
ID, retry, and an empty page. Configured Discover shelves, live provider
results and matched visual comparisons remain open.

The list page also follows the saved English, French, or Arabic locale for
its Discover link, invalid-ID and empty states, retry action, and pagination
controls. URL-backed page state and the existing endpoint are unchanged.
Twelve saved-locale cases plus the existing public-list identity and paging
checks pass across desktop, iPhone, Android, and tablet (20 cases). English
baseline and candidate screenshots match pixel-for-pixel at 1440 × 900 and
390 × 844. French desktop and Arabic phone captures were inspected for RTL,
wrapping, and overflow. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/tmdb-list-visual/`.
Bundled Express mount, live TMDB results, and independent linguistic review
remain open.

Configured public TMDB lists now appear as Discover shelves. Lumen reads
the same enabled list definitions as native SeerrNG, preserves their
order relative to one another, and loads each list as it approaches the
viewport. Shelves reuse the standard rail and link to the full list page.
Eight standalone checks passed across desktop, iPhone, Android, and
tablet. Other configured shelf types, live provider coverage, and matched
visual comparisons remain open.

The configured video shelf renderer also supports TMDB movie and TV
keywords and genres, movie studios, TV networks, and streaming providers.
The preview and its See All link share the same validated filter values.
Eight standalone checks passed across four viewport presets, covering
keyword and provider queries, invalid data, and existing TMDB list
shelves. Other configured shelf types, live provider results, and matched
visual comparisons remain open.

Configured TMDB search shelves now reuse Search's movie, series, person
and collection cards. See All opens the configured term in Lumen Search.
Twelve standalone checks passed across desktop, iPhone, Android and
tablet, including a mixed-result shelf with overlapping numeric IDs and
a term containing punctuation. Live results and matched visual
comparisons remain open.

Configured Open Library book-subject shelves now appear in Discover.
See All carries the source subject into Books or Audiobooks, and the
format switch retains that subject. Bundled native book bookmarks also
preserve it. Eight standalone checks across four viewport presets and
the bundled redirect tests passed. Live provider results and matched
visual comparisons remain open.

Configured MusicBrainz genre and ListenBrainz chart shelves now appear
when the Music category is available. See All preserves the genre or chart
in Music, including the yearly chart, and genre filtering can be cleared.
Bundled native music bookmarks preserve the same filters. Eight browser
checks across four viewport presets and the bundled redirect tests passed.
Live provider results and matched visual comparisons remain open.

### Association explorer

Movie and series details link to the Associations explorer. The list uses
the existing viewer-scoped endpoint, shows each relationship and reason,
and filters by relationship type. Native explorer bookmarks open under
bundled frontend lock and in the companion. The route supports movie,
series, MusicBrainz album and artist, and Open Library book identities.

Eight browser checks across four viewport presets, bundled redirects,
and the companion route inventory passed. Graph presentation, entry
links from music and books, live provider results, and matched visual
comparisons remain open.

MusicBrainz albums and artists and Open Library books now link to
Associations from their detail pages. The book route preserves audiobook
format through filtering and Back to Details. Bookshelf-only identities
do not offer an Open Library association link. Eight browser checks
across four presets passed. The graph view, live provider data, and
matched visual comparisons remain open.

Associations now has an interactive graph on viewports of at least
640 CSS pixels. Graph nodes use the same relationship filters and detail
links as the list. Keyboard selection reveals the relationship reason.
Narrow viewports show the list, including when opening a graph URL.

Eight standalone checks passed, including graph selection on desktop and
tablet, the narrow fallback, and music and book entry points. Live
provider data and matched visual comparisons remain open.

The companion now opens native movie and series discovery bookmarks,
including keyword, genre, language, movie studio, and TV network routes.
Browse translates native sort, availability, and genre matching without
reapplying those filters after Clear Discovery Filters. Production proxy
checks and eight standalone browser checks passed across four viewport
presets.

Native Search bookmarks now retain the search term and supported media
scope on the companion. The Search screen and desktop search bar use
the same URL normalization, and editing a filter writes the Lumen
parameters. Eight standalone checks passed across four viewport presets.

Bundled frontend lock now retains the graph view, relationship filter,
and audiobook format on Association bookmarks. The server integration
test covers those supported values and ambiguous or unsupported inputs.

### Franchise explorer

Series details link to the Franchise explorer. It groups source material,
adaptations, sequels and other relationships and displays the server's
evidence and confidence. Viewers can follow the franchise. The server
controls access to Confirm and Hide. Native TV and anime franchise links
open in both Lumen deployments.

Four standalone browser checks verified the series entry point, linked
identity and curator confirmation. Bundled redirect and companion route
inventory checks passed. Live AniList results, creation of curated
relationships, and matched visual comparisons remain open.

Authorized franchise curators can now add a relationship using the
related title's media type and catalogue ID, with optional evidence.
Lumen uses the existing curator endpoint and keeps form values when the
request fails. Four standalone checks passed, including confirmation,
creation and retry. Live provider and matched visual checks remain open.

Following now opens anime relationship updates at their exact Franchise
destination and displays the relationship type. Updates for supported
person, artist, comic and collection targets also open their detail
routes. Eight standalone browser checks passed for franchise and patch
event links across four viewport presets.

Switching franchise titles resets the previous title's follow state. Franchise
links translate Classic search queries and retain encoded Bookshelf catalog
IDs. Four standalone cases and the 32-case bundled Following suite verified
the link destinations and per-title follow submissions using API fixtures.
Live AniList and Bookshelf responses remain unverified for these checks.

The curator form saves direct links for Bookshelf volume IDs and numeric
IGDB IDs. Eight targeted standalone browser cases and the 40-case bundled
Following suite verified the submitted identities and the links returned
after saving. Both browser runs used API fixtures. A separate route test
verified that local sessions enforce curator access and that authorized
writes persist both link types in SQLite. Live catalog lookup remains open.

The Franchise explorer can browse a related anime by its AniList ID
while keeping the catalog search available. Standalone and bundled
browser fixtures verified the link. A separate live provider check
resolved Naruto to its sequel and opened the sequel's franchise using
the exact returned ID. The live check used isolated SQLite storage and
exercised the server lookup directly. Matched visual review remains open.

### Provider Discovery

Discover links to Lumen's Trakt, AniList, and MDBList feeds. Feed and
page selection, list references, and unmatched-only filtering are URL
backed. Confirmed movie and series identities open their exact detail
pages. The feeds bypass persistent browser caching. Both deployments
accept the native Provider Discovery bookmark.

The production build, bundled and companion redirects, and four
standalone browser checks passed. Identity mapping controls,
provider-specific retry timing, live accounts, and matched visual
comparisons remain open.

Provider Discovery now supports finding, changing, and resetting personal
title mappings where the server exposes a stable provider identity.
Selecting a catalogue result saves its exact TMDB ID and media type.
Eight standalone checks passed for mapping, reset, and feed browsing.
Live accounts and matched visual verification remain open.

Rate-limited feeds show a countdown and disable Retry until the server's
bounded Retry-After expires. Expired authorization links to Linked Accounts.
The production build and standalone Provider Discovery browser checks passed
across the four configured viewport presets. Live provider accounts and
matched native visual comparisons remain open.

AniList feed rows open the exact anime franchise even when no TMDB match
exists. Four standalone cases and the 44-case bundled Following suite
passed. The targeted cases opened an unmatched title from the feed and
verified the AniList route and franchise heading using API fixtures.
Live AniList data and matched visual verification remain open.

Provider Discovery shows the unmatched title count for the current page.
Sixteen fixture-based browser checks passed per deployment across desktop,
iPhone, Android, and tablet. They verified that the count clears on page
change and that mapping, reset, retry, and provider reconnect still work.
Matched visual and live provider checks remain open.

Provider Discovery identifies personal, curated, and catalog-ID matches
and explains when a title has no stable provider ID for saving a match.
Sixteen browser cases passed per deployment with API fixtures, including
assertions for all three match labels and the missing-ID explanation.
Matched visual and live provider checks remain open.

Unmatched AniList titles display their cover using the shared poster and
the AniList image proxy URL. Four standalone cases and 20 bundled cases
passed. The browser fixture verified the image request path, decoded
image, and franchise navigation. The real Express proxy fetched a public
AniList cover and returned a 230 × 325 WebP. The repeated request returned
the same bytes with a cache hit. A separate run fetched the live trending
feed with isolated SQLite mappings and passed the cover URL of an actual
unmatched row to the Express image proxy. The response was a 230 × 324
WebP. Browser-to-provider verification through
a complete deployment and matched visual review remain open.

### TV request access review

TV Request Settings lets user managers approve or decline pending
previous-season watch requests. The review queue uses the existing
permission-checked endpoints, refreshes after a decision, and leaves
self-review to another manager.

TypeScript and the production build passed. Standalone browser fixtures
verified approval, decline, cancellation, recovery from concurrent review,
self-review restrictions, and manager-only queue access on desktop, iPhone,
Android, and tablet. Live accounts, bundled rendering, and matched native
visual comparison remain open.

### Share text and links

Discover opens Lumen's Share page for pasted titles, links, and ISBNs.
Text from Share bookmarks pre-fills the form. The existing recognition
endpoint returns candidate groups, and confirmed requestable matches use
the same request payloads as native SeerrNG. Successful rows stay marked
when another selected request fails.

TypeScript, the standalone build, and browser fixtures passed for bookmarked
text, exact series navigation, explicit submission, and all-season selection
across four presets. Image recognition, the OS Share Target, live recognition,
bundled execution, and matched native visual comparison remain open.

Share accepts a file, clipboard image, or dropped image when server image
recognition is available. It checks the advertised size limit before upload
and still resolves typed text when an attached image cannot be read.
TypeScript, the standalone production build, and eight browser fixture checks
passed across desktop, iPhone, Android, and tablet. Fixtures cover file
selection, size limits, raw upload, and text fallback. Clipboard and drop
interactions, local barcodes, OS sharing, live OCR, the bundled deployment,
and matched visual comparison remain unverified.

Share checks attached images for book ISBNs on the device when the browser
provides barcode detection. With server OCR disabled, only the recognized
ISBN is sent when the user asks for matches. Native and Lumen Share use the
same detector and release the decoded bitmap even if detection fails.
TypeScript, the production build, and twelve standalone browser fixture
checks passed. The ISBN fixture substitutes the browser barcode API.
Live barcode decoding and matched visual checks remain open.

### Installed app Share Target

Lumen's web app manifest accepts shared text, links, and images through
a scope-relative POST target. A scoped service worker keeps the form in
a short-lived local inbox until Share opens it, then removes the entry.
Share still requires explicit recognition and request actions. Both
deployment configurations provide a fallback when no worker handles the
handoff.

TypeScript, the production build, and 16 standalone browser checks passed.
The handoff fixture uses a real service worker and a browser-submitted form
across four viewport presets. Installed OS share sheets, the bundled server
handoff, and matched native visual comparison remain unverified.

The Share Target fixture now reads the built manifest and posts to its
declared action. It verified the controlling worker, text and image delivery,
and inbox removal at both `/` and `/lumen/` across all four browser presets.
The Express route test also verified the no-worker redirect, no-store
header, and bundled Share page entry. Browser checks used production builds
served by Vite preview. Physical OS share sheets and matched native visual
comparisons remain open.

### Track Requests

Music links to the Soulseek track request queue. Lumen shows personal and
authorized household requests, active and historical status, and search
progress. The page uses the existing endpoints for manager approval and
decline and for authorized cancellation.

TypeScript, the standalone production build, and four browser fixtures
passed for scope selection, approval confirmation, and search readback.
Live Soulseek, decline and cancellation checks, bundled rendering, matched
native visual comparison, and track creation from playlist import or song
identification remain open.

### Song identification

Track Requests links to Identify a Song. Lumen restores the source from
recognition bookmarks, shows queued and running progress, and offers
matched album links and exact recording requests through the existing
SongID and Soulseek endpoints. The route now localizes its form, queue
position, album/track sections, exact-match labels, request state, service
availability, and recovery messages in English, French, and Arabic. The
multiline input uses the shared configuration-row layout, keeping its label
and source text separate on phones. Request authorization and API payloads
are unchanged.

The browser flows verify the source restored from the URL, queue polling,
matched album link, exact-match display, exact recording request body, provider
failure and retry, and the mobile request button clearing the fixed tab bar.
All 48 cases pass across standalone and embedded production builds for three
locales and four viewport presets. French desktop and phone baseline/candidate
screenshots were compared; Arabic desktop and phone candidates were inspected.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-song-identification-20261121/`.
Live SongID/Soulseek services, independent translation review, and matched
native visual comparison remain open.

### Playlist import review

Music opens a Lumen playlist preview using the Spotify and YouTube
resolver. Users select matched albums or eligible unmatched tracks before
submitting. Successful items remain marked while failed selections remain
available to retry. TypeScript, the production build, and four standalone
browser fixtures initially passed for mixed playlist submission. Subsequent
browser fixtures verified retry after a partial failure and Spotify disconnect.
Server fixtures verified the cancelled Spotify callback return path for bundled
and companion deployments. Live providers, bundled rendering, and matched
native visual comparison remain open.

### Administrator system logs

The route boundary now has a matrix fixture for all 39 administrator
destinations. Standard users do not see the administrator entry, and direct
navigation redirects them to `/me`; administrators retain the route and can
reach SeerrNG Administration from the desktop sidebar or the mobile You page.
The administrator home screen exposes a link for every settings route in the
matrix, and the index has no horizontal overflow. The matrix passes in desktop,
iPhone, Android, and tablet viewport projects. It verifies Lumen's client
routing boundary; server-side API authorization and
each settings page's feature-specific permissions remain separate checks.

The Account administration section opens System Logs inside Lumen.
Administrators can search and filter logs, page through results, inspect
structured data, copy an entry, and opt into live refresh. Log responses
bypass persistent application and HTTP caches. TypeScript, the production
build, and four standalone browser fixtures passed for search, details,
and non-admin route denial. The 24 System Logs, Scheduled Jobs, and System
Caches browser cases also passed against standalone Vite and the freshly built
bundled Express mount across all four viewports. Live server logs, clipboard
actions, refresh against real jobs, and native visual comparison remain
unverified.

### Administrator scheduled jobs

Administrators can inspect scheduled jobs and next execution times, run or
cancel a job, toggle schedules, and edit cron expressions for configurable
jobs. The page uses the existing admin endpoints and refreshes job state.
TypeScript, the production build, and four standalone browser fixtures passed
for run confirmation and schedule save readback. System Caches displays API,
DNS, and image cache statistics and offers confirmed API and DNS flushes.
The schedule picker preserves loaded cron expressions and describes its
presets according to the scheduler's actual cadence. Twelve standalone
browser cases passed across the four viewport presets for guided schedule
editing, run confirmation, and DNS flush. Live jobs and native visual
comparison remain open.

System Caches also shows the configured image-cache directory and
distinguishes unavailable DNS data from an empty cache. Four standalone
browser checks verified the path, DNS flush, data retention during an
outage, and removal of cache details when the server denies access.

### Managed users

Administrators and delegated user managers can search the user directory,
create local accounts, and manage eligible accounts' profile, local
password, explicit permissions, request destinations, age gate, maturity
limits, media categories, indexer visibility, quotas, and Episode Queue
defaults. Administrators can also import and sync accounts through the
configured Plex, Jellyfin, or Emby provider. Deletion uses the existing
server protections and requires confirmation.

The directory accepts native list and account settings bookmarks in the
companion and bundled deployments. Profile, password, permissions, maturity,
Episode Queue, linked accounts, TV request access, and notification bookmarks
open the matching panel for the selected user. Delegated notification settings
reuse the personal forms. Browser registration stays with the signed-in user.
The 52 managed-user browser checks passed against standalone Vite and the
production Express `/lumen/` mount across desktop, iPhone, Android, and tablet
projects. The account-permissions bookmark also passed in both deployments.
Together, all 56 selected account and managed-user checks passed on the bundled
mount. They use fixture APIs; live providers and matched native visual
comparison remain unverified.

### Delegated watchlists

The user directory and native user-watchlist bookmarks now open Lumen's
read-only view for administrators, request managers, and users with Watchlist
View permission. The directory link requires access to the directory as well.
The view uses the existing authorized user endpoint and shares the filter,
pagination, catalogue-link, and recovery controls with the personal list.

Thirty-six watchlist browser cases passed in both standalone Lumen and the
production Express `/lumen/` mount across desktop, iPhone, Android, and tablet.
They include directory entry, filtering and pagination on the selected account,
absence of removal, and no watchlist request on a denied direct visit. Express
and nginx tests verified bookmark redirects. Live Plex and matched native visual
acceptance remain open.

The user directory and native user-request bookmarks open the existing
Requests screen with the selected requester. Supported status and media
filters carry forward from native bookmarks. Express and nginx redirect
checks and standalone browser fixtures at all four viewport presets verified
requester scoping. Matched native visual acceptance remains unverified.

Personal Password and Episode Queue bookmarks now scroll to the named
section once settings load. Profile refreshes preserve the mounted form
and the confirmed save feedback. Express and nginx bookmark checks and
12 standalone account browser checks passed across the four viewport
presets. Matched native visual acceptance remains unverified.

Account Settings shows the signed-in member's account type and role.
Twelve browser cases passed per deployment with API fixtures. The
bundled suite covered the Jellyfin account label, member role,
password and Episode Queue anchors, and profile save and retry.
Matched visual review remains open.

Lumen exposes the Advanced Theme editor only to administrators, matching the
native route's ADMIN permission. Authorized administrators can edit personal
theme colors through the authenticated account API. Classic Advanced Theme
bookmarks open the corresponding section in both deployments, while regular
accounts remain on Account Settings without loading the editor API. Theme
controls are separately covered by administrator persistence fixtures.

Theme edits send only changed colors. The API merges concurrent edits
to different colors, including a clear and a save, while retaining other
overrides. The 24-case account API suite and 16 browser cases per
deployment passed. Browser tests used fixtures for save, retry, reload,
and restore-default behavior. Matched standalone Chromium renders at
390 and 1440 pixels showed an identical You page with default colors
before and after the feature. The theme editor displayed a stored
background override and kept its inputs within both viewports.
The renders used an isolated fixture account.

Edit All Overrides offers the complete saved JSON object, including
numeric settings. The server validates and merges changed keys. Switching
to the color controls and back keeps unfinished JSON edits. The 16-case
bundled browser suite passed with fixtures. Matched standalone renders at
390 and 1440 pixels
identified a 40-pixel editor. Using the shared JSON textarea style
increased it to 221 pixels and kept it inside the viewport. The fixture
included long token names and a numeric override.

The seventh mapped color is Classic's menu background. It paints Lumen's
shared sheets, genre popover, and their sticky action backgrounds. At
390 and 1440 pixels, fixture browser checks confirmed the genre picker's
default surface, the stored override's computed color, unchanged width,
and Escape dismissal. Four checks passed against the production Express
`/lumen/` mount for the account editor and genre picker. Two additional
bundled checks opened the movie request dialog through its poster action
and compared its default and customized renders at 390 and 1440 CSS
pixels. The surface and sticky footer used the saved color. Dialog
geometry, typography, button alignment, and Cancel dismissal held.
These checks used a fixture account and a 1080p/4K movie. Other sheet
consumers and live account persistence were outside this browser review.

Lumen maps four more Classic colors to the desktop sidebar: gradient
start and end, divider, and navigation hover. Eight standalone account
checks and two focused bundled checks passed with account fixtures.
At 1440 CSS pixels, matched default and customized sidebar renders
preserved the rail width, navigation spacing, and footer position.
The browser verified the saved gradient, divider and hover colors,
then restored the default divider after clearing the overrides.
The 390-pixel account check used the mobile layout, where the desktop
sidebar is hidden.

The desktop sidebar uses a solid fill until a valid gradient color is
set. One saved endpoint blends into the regular sidebar surface. The
standalone and bundled desktop and iPhone account checks passed.
Matched 1440-pixel bundled screenshots retained the 248-pixel sidebar
width and the same default and customized surface colors. These
checks measured computed paint and geometry without timing rendering.

The desktop search header honors the saved Classic scrolled header
color and uses the regular surface when that override is cleared.
Scrolling disables backdrop blur on the header, and returning to
the top restores the original glass treatment. Eight standalone
account tests and two focused bundled tests passed. At 1440 CSS
pixels the bundled header stayed 71 pixels tall in all three states.
The 390-pixel tests covered the account editor where the desktop
header is hidden. Rendering time was not measured.

In the mobile layout, the saved navigation gradient and border colors
also paint the bottom tabs. A single saved gradient endpoint blends
into the standard glass surface. Standalone and bundled account
checks passed at 390 and 1440 CSS pixels. Matched phone screenshots
preserved the 366-by-66-pixel bar, the tab spacing, and the selected
You tab. The fixture verified both saving and clearing mobile colors.

### About release history

About loads the public GitHub release history on demand, identifies the
latest and installed versions, and expands release notes as plain text.
Four browser cases passed per production deployment, with Express at
`/lumen/` and the standalone nginx image. The browser used fixtures to
check deferred loading and retry. Both production responses permit the
GitHub API through their content security policy. A separate live request
returned 20 releases and allowed cross-origin reads. Live browser loading
and matched visual review remain open.

Live GitHub notes exposed horizontal overflow at 390 pixels. The shared
long-prose style now wraps long links. A repeat live browser check passed
at 390 and 1440 pixels. Each production deployment passed 20 fixture cases across release
history and book descriptions. Matched Chromium renders of person biographies at 390 and 1440 pixels
were byte-identical for ordinary text. A long unbroken link wrapped
within the biography at both widths. This comparison used a fixture
profile and standalone production builds.

Release notes now use the same Markdown renderer as Classic. Lumen
downloads the renderer when a release is expanded and renders HTTPS
links without raw HTML or embedded images. Four browser cases passed
in each production deployment, covering Markdown headings, links,
deferred loading, retry, and long-text wrapping. These runs used
fixtures. Matched standalone Chromium screenshots using live GitHub
notes for v3.72.38 showed headings, lists, and working HTTPS links.
At 390 and 1440 pixels the Markdown content retained the plain-text
baseline width and fit without horizontal overflow. The browser used a
fixture administrator and default Lumen theme.

About links update status to release history, main branch history, or
the installed development commit comparison. It also includes lawful-use
guidance. Eight browser cases passed in each production deployment with
fixtures, including the development comparison destination. Matched
visual review of the update link and guidance remains open.

About and Release History now follow the saved French and Arabic locales, including version metrics, update and development-build status, support and legal copy, release-history controls, loading and retry feedback, and version markers. Update destinations now depend on a stable status value instead of translated display text. Removing the inline TMDB terms link also normalizes punctuation while preserving the separate terms button. Eight browser cases per deployment passed against standalone and embedded production builds at desktop (1440 × 900), iPhone (390 × 844), Android (412 × 915), and tablet (834 × 1194). Three existing About and navigation cases also passed against the embedded `/lumen/` mount. Fixture-based GitHub release responses verify lazy loading, retry, notes, links, and development comparison behavior. Matched French desktop and Arabic iPhone baseline/candidate captures were inspected; no new clipping or horizontal overflow was found. Live release-history requests and independent linguistic review remain open. Evidence is retained at `seerrng-lumen-admin-about-localization-20261120`.

### Instance General Settings

The administration menu opens a Lumen General Settings page for the
SeerrNG application title, public URL, and existing request policies.
Native General Settings bookmarks resolve to it in bundled and companion
Lumen. The form sends only changed identity fields, keeps drafts after
errors, and confirms the values in the server response.

TypeScript, the production build, Express and nginx routing, and four
standalone browser cases passed. The cases exercised navigation, failed
save recovery, and clearing the public URL. Live configuration writes,
bundled workflow rendering, matched native visual acceptance, and the
remaining instance settings are open.

The direct-route permission audit derives routes from Lumen's router, so newly
added administrator routes enter the standard-user check automatically. The
current 39 route patterns expand to 43 direct URLs, including optional
notification and user-management paths. A standard signed-in user is redirected
to `/me` from every URL in the standalone Vite preview and the production Lumen
build served under `/lumen/`, across desktop, iPhone, Android, and tablet. API
responses were fixtures, so this verifies client-side route gating only; API
authorization, administrator workflow correctness, Express-mounted behavior,
and matched native visuals remain separate checks.

General Settings also exposes image caching and automatic version checks.
The shared settings endpoint now validates and persists the version-check
switch used by both frontends. The 102 settings-route tests and eight
standalone General Settings and About browser cases passed. The browser
cases verified that false values remain selected after reloading and that
About skips update checks when disabled.

### Connection Hosts

The administrator-managed Connection Hosts page now follows the saved French
and Arabic locales, including field labels, add/remove/discard actions, save
feedback, load failures, and server-side validation errors. Its guidance says
that saved entries contain a hostname or IP without a scheme or port, do not
test or open a connection, and leave service-specific settings untouched.
Eight standalone and eight production `/lumen/` browser cases passed across
desktop (1440 × 900), iPhone (390 × 844), Android (412 × 915), and tablet
(834 × 1194). Fixtures covered add, edit, remove, discard, 503 recovery,
duplicate-name validation, save/reload readback, and clearing the final host.
French and Arabic
baseline/candidate captures were compared at matching desktop and iPhone
viewports; the responsive fields and controls fit without horizontal overflow.
Evidence is retained at `seerrng-admin-connection-hosts-localization-20261120`.

### Network Settings

The Lumen Network Settings page now follows the saved French and Arabic
locales for its network, DNS, proxy, and browser transport controls, help,
warnings, save feedback, and relevant validation errors. DNS TTLs, proxy
details, administrator network lists, and TLS fields appear only when their
parent setting requires them. Enabling browser sign-in over HTTP requires an
explicit risk acknowledgement; switching to HTTPS clears that acknowledgement
and the HTTP sign-in setting. Client-side validation checks proxy ports and
non-empty administrator network lists, while the server remains authoritative
for the current-client-IP restriction. Environment overrides still disable
the built-in TLS controls.

Twelve standalone and twelve production `/lumen/` browser cases passed across
desktop (1440 × 900), iPhone (390 × 844), Android (412 × 915), and tablet
(834 × 1194), covering French, Arabic, and English. Fixtures verified field
visibility, isolated save payloads, failed-save recovery, HTTP risk
acknowledgement, TLS-mode transitions, proxy and DNS controls, and rejection
of an administrator network list that excludes the current client. Matched
English baseline and candidate captures were reviewed at all four viewport
sizes; no horizontal overflow or unrelated layout changes were found. Live
TLS restarts and network enforcement were not exercised. Evidence is retained
at `seerrng-admin-network-localization-20261120`.

The provided-certificate mode now includes SeerrNG's existing file-path
guidance: certificate files must be mounted where the SeerrNG process can read
them, and private keys are not uploaded through this form. The message appears
only in provided-certificate mode, follows English, French, and Arabic, and
does not introduce a file-upload control. Six desktop and iPhone browser cases
verified the mode transitions and guidance. Baseline/candidate captures at the
same viewport sizes show the added note without changing the form controls or
causing horizontal overflow. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-network-certificate-guidance-20261122/`.

### Swipe Settings

The Lumen Swipe administration page now follows saved English, French, and
Arabic locales for its provider choices, privacy guidance, model and effort
help, key state, and feedback. Changing providers selects the appropriate
provider-specific model default. Unsaved edits, including a newly entered key
or a request to clear a saved key, can be discarded without sending them.
Generic server failures use localized feedback while descriptive provider
errors remain visible.

Twelve standalone and twelve production `/lumen/` browser cases passed across
desktop (1440 × 900), iPhone (390 × 844), Android (412 × 915), and tablet
(834 × 1194). Fixtures covered French and Arabic rendering, provider switching,
secret redaction, provider testing, failed-save recovery, retry, and discard.
The existing Swipe navigation and save suite passed 20 cases. Matched baseline
and candidate English captures were reviewed at all four viewport sizes; the
page retained its existing row and control layout, and the shorter provider
choice avoids select clipping. Evidence is retained at
`seerrng-admin-swipe-localization-20261120`.

### Discovery Integration Credentials

The provider credential editor now localizes its title, instructions, provider
names, fields, configured state, clear actions, loading state, and save feedback
in English, French, and Arabic. Trakt, AniList, Simkl, and MDBList secrets
remain masked; clearing one provider stages empty values for only that provider.
Failed saves retain the staged values for retry, and permission failures have
their own localized message.

Twelve standalone and twelve bundled browser cases passed across desktop,
iPhone, Android, and tablet viewports. They cover all three locales, secret
masking, clearing credentials, failed-save recovery, and successful retry.
Matched baseline and candidate captures were reviewed at desktop and mobile
sizes; the existing geometry is unchanged. The neighboring Discovery Regions,
Automatic Blocklist, Streaming Request Policy, and Shared Discovery Title
Matches tools remain separate localization and workflow-parity work. Evidence
is retained at `seerrng-admin-discovery-localization-20261120`.

### Automatic Blocklist

The Automatic Blocklist settings and shared keyword-search results now follow
the saved English, French, and Arabic locale, including genre labels, search,
page limits, paging feedback, and save confirmation. Keyword results are shared
with Discover filters and request override rules, so their labels use the same
translations at those entry points. Invalid keyword IDs and page limits still
block saving, selected keywords carry across result pages, and failed saves
retain the draft for retry. A long French save label was shortened after the
phone-width check caught horizontal overflow.

Twelve standalone and twelve production-asset `/lumen/` browser cases passed
across desktop, iPhone, Android, and tablet projects. The existing Discovery
administration regression suite passed 12 cases. English baseline/candidate
captures were rendered at matching sizes and reviewed at desktop and phone
widths; the underlying controls and spacing were unchanged. Live keyword and
genre provider results remain unverified. Evidence is retained at
`seerrng-admin-blocklist-localization-20261120`.

### Streaming Request Policy

The Discovery administration policy editor now localizes its enable switch,
subscription conditions, request actions, rejection message, per-user override,
loading state, and save feedback in English, French, and Arabic. Conditional
fields continue to match the selected action, and saving still requires a
server readback that matches the draft. The browser fixtures cover disabled
and enabled states, rejection-message visibility, changed values, failed-save
retention, and successful retry.

Twelve standalone and twelve production-asset `/lumen/` cases passed across the
four viewport projects. The Discovery administration and movie-request policy
regression suites passed 20 cases. English baseline and candidate captures were
rendered at matching desktop, phone, Android, and tablet sizes and reviewed at
desktop and phone widths. Live user-subscription decisions remain unverified.
Evidence is retained at
`seerrng-streaming-policy-localization-20261120`.

The Discovery Regions and Languages form and Shared Discovery Title Matches
panel now use English, French, and Arabic messages for their labels, choices,
instructions, validation, confirmation, and save feedback. Region saves retain
the selected draft after a service failure; shared pack publication can be
retried without reselecting the file or repeating the account-wide acknowledgement.
Shared pack deletion still requires its explicit confirmation.

Twelve standalone and twelve bundled-asset browser cases passed across desktop,
iPhone, Android, and tablet projects, covering all three locales, failed-save
retry, pack publication retry, deletion, and horizontal overflow. French and
Arabic baseline/candidate captures for `/admin/discovery` were compared at
matching 1440 × 900 desktop and 390 × 844 iPhone viewports. Text wraps
naturally with the existing controls and spacing; the fixed mobile navigation
continues to overlay the lower viewport while scrolling, as it did in baseline.
Live `/regions` and `/languages` provider results, independent translation
review, and the full Express production `/lumen/` mount remain unverified.
Evidence is retained at
`seerrng-discovery-child-localization-20261120`.

### Instance Media Categories

Administrators can change the instance category switches in Lumen, with
bookmarks in both deployments and a shared switch list with managed
account settings. Eight standalone browser cases across the four
viewport presets verified changed-only saves, reload readback, direct
route denial, and the existing managed-user category and indexer controls.
Express and nginx verified the redirects. The Age Gate section now edits
the default restriction, movie and series rating ceilings, and country.
Twelve standalone browser cases verified Age Gate validation and retry,
independent category drafts, and the managed-user maturity regression path.
Bundled workflow rendering and matched native visual acceptance remain open.

General Settings also selects Full SeerrNG, bundled Lumen, or the standalone
companion as the default interface. It supports enforcing the default and
the bundled-only non-administrator lock. Eight standalone browser checks
verified mode selection, companion URL requirements, lock clearing when
leaving bundled mode, and readback. Live mode switching and matched native
visual acceptance remain open.

General Settings also manages local and media-server sign-in. Jellyfin
instances expose the Quick Connect-only switch while media-server sign-in
is enabled. The form rejects disabling both sign-in methods. Twelve
standalone General Settings browser checks covered save and readback,
including the Jellyfin fixture and the validation state. Live sign-in,
bundled rendering, and matched native visual acceptance remain open.

The Media Categories page also edits account category defaults independently
of instance availability and the Age Gate. Twelve standalone browser cases
covered changed-only default saves, reload readback, separate category drafts,
and Age Gate recovery. Live inheritance and matched native visual acceptance
remain open.

Media Categories and Age Gate now use the saved French and Arabic locales for
category names and descriptions, instance and inherited-default guidance,
rating fields, validation, errors, and save confirmations. The category rows
retain their shared control owner, and the adult policy note remains distinct
from the row label. Eight standalone and eight production `/lumen/` browser
cases passed across desktop (1440 × 900), iPhone (390 × 844), Android
(412 × 915), and tablet (834 × 1194). Fixtures verified isolated writes,
readback, failed-save recovery, and Age Gate country validation. Three existing
English category and Age Gate regression cases also passed. French and Arabic
baseline/candidate screenshots were compared at matching viewports; no
horizontal overflow or new control geometry changes were found. Live policy
inheritance and independent linguistic review remain open. Evidence is
retained at `seerrng-admin-categories-localization-20261120`.

General Settings now edits inherited request limits and quota windows
for each server quota category. Saves send only changed fields for the
selected category and preserve drafts for other categories. TypeScript,
the production build, and 20 standalone browser cases passed, including
per-user quota regression checks. Live quota enforcement and matched
native visual acceptance remain open.

General Settings also edits the explicit default permissions assigned to
new accounts. The form requires confirmation and preserves the native
default editor's restriction on changing the Admin permission. Twenty-four
standalone browser checks covered General Settings and delegated permissions,
including high permission bits and settings readback. Live account creation
and matched native visual acceptance remain open.

General Settings now manages whether eligible media-server accounts may
sign in before an import. Native Users settings bookmarks open General
Settings in both deployments, with a link to Media Categories for
account category defaults. Four standalone sign-in settings browser
checks and the Express and nginx bookmark checks passed. Live account
admission and matched native visual acceptance remain open.

General Settings now edits the shared-availability display mode through
the existing SeerrNG settings endpoint. The server validation test and
four standalone browser checks verified supported values, changed-only
save, and reload readback. Lumen collection playback already consumes
this setting. Applying it consistently to posters and title details,
and matched native visual acceptance, remain open.

Shared availability now applies to the standard video poster component.
The policy is read once per page through the shared settings cache. Shared
copies can be marked or hidden, and poster playback and quick requests
respect the difference between display status and actual acquisition state.
Eight standalone browser cases passed for poster status and settings-error
recovery. Featured cards now use the same availability presentation and
playback link filtering. Eight standalone cases verified poster and
featured-card behavior across the four viewport presets. Title details
and matched native visual acceptance remain open.

Movie details now use the shared-availability mode for their status,
4K summary, and playback actions. The raw acquisition status still
controls request eligibility. Twelve standalone poster, featured-card,
and movie-detail cases passed across four viewport presets, including
a shared HD copy alongside a viewer 4K copy. Series details and matched
native visual acceptance remain open.

Series details now distinguish viewer-owned and shared seasons for the
selected quality. The list preserves request eligibility and suppresses the
whole-series playback shortcut when the entry also contains shared seasons.
Twenty-eight standalone browser cases passed for series availability and
request-state regressions. Episode-level presentation and matched native
visual acceptance remain open.

The on-demand episode panel now applies the selected season’s viewer
coverage separately to HD and 4K source reports. Eight standalone browser
checks verified mixed-quality reports, source-label hiding, and the
existing on-demand season switch. Matched visual acceptance remains open.

Coming Soon now marks or hides shared availability while keeping actual
acquisition state responsible for the Request action. Twenty-four
standalone browser checks covered Coming Soon across four presets,
including shared status and request eligibility. Matched native visual
acceptance remains open.

Combined watchlists now identify SeerrNG and Plex rows. Lumen can remove
a confirmed local entry and reload the list so any matching Plex entry
stays visible. Thirty-six standalone and 36 bundled watchlist browser cases and nine server
watchlist cases passed. Live Plex and matched native visual acceptance remain open.

Watchlist pagination now reconciles out-of-range pages after the server
reports a smaller result set. This keeps active filters when removal
empties the final page. All 36 standalone and 36 bundled watchlist browser cases passed.
Matched native visual acceptance remains open.

The bundled frontend lock now redirects supported book, comic, album, and
artist ID bookmarks. The Book page understands the native audiobook
parameter directly in both deployments. Two server routing tests and four
standalone browser cases passed, including audiobook association return
links. Provider-specific encoded IDs remain outside this redirect check.

The bundled lock now preserves scoped Bookshelf IDs, their lookup-title
hint, and encoded magazine titles. Express serves dotted magazine
titles while missing asset URLs still return 404. Two routing tests
and four standalone book detail cases passed.

Sportarr league details now show paginated events, broadcast dates, and
file and monitoring states through the existing server endpoint.
Bundled Lumen also redirects native league bookmarks. Two routing tests
and four standalone browser cases passed. Live Sportarr and matched
native visual acceptance remain open.

Whisparr scene bookmarks and catalog links now preserve the service ID.
Scene display and default-destination request state are loaded separately
where needed. Eight standalone scene and Sportarr browser cases and two
routing tests passed. Live provider behavior and matched visual acceptance
remain open.

Whisparr request rows now look up and link to the saved destination.
Cached rows with a different destination are resolved again. Eight
standalone request and scene checks passed. Live provider behavior
and matched visual acceptance remain open.

Issue details now link to books, albums, comics, and magazines through
the affected media's catalog identifier. The 24 standalone issue browser
checks passed, including encoded Bookshelf and magazine identifiers.
Matched native visual acceptance remains open.

Issue list filters now include media type, issue type, and reporting period.
Status, filters, search, and page are bookmarkable, and changing a filter
resets pagination. All 28 standalone issue cases and both server routing
tests passed. Advanced native metadata filters and matched visual
acceptance remain open.

Poster Watchlist actions now cover movie, TV, book, music, comic, and magazine
cards. The book browser regression verifies that the first action reads fresh
detail state and posts the exact Open Library work ID; it passed on desktop,
iPhone, Android, and tablet. Existing movie/TV poster regressions also passed
on all four projects. The Lumen production build passed. Native-matched and
bundled acceptance for this surface remain open.

Issue lists now support media-specific year, genre, studio, network, and
album type filters along with sort order. The metadata controls use text
entry for genre, studio, and network. The bundled lock preserves these
parameters on native bookmarks. All 28 issue browser checks and two
server routing cases passed. Matched native visual acceptance remains open.

Issue discussions preserve list parameters on their return link and when
returning after deletion. All 28 standalone issue browser checks passed,
including the filtered page round trip. Matched visual acceptance remains open.

Issue pagination now returns to the last available page when deleting a
report reduces the page count. The active filters stay in the URL. All 32
standalone issue browser checks passed. Matched visual acceptance remains open.

### Swipe recommendations

Lumen opens the native recommendation decks for movies, series, and books.
The server gates the available categories. Requests use the account's Swipe
preferences and record the decision after successful submission. Users can
also pass, mark a title seen or read, and undo a decision.

Desktop navigation and the mobile You page show Swipe only when the admin has
enabled it and the viewer has request access (or is an administrator), matching
the native permission gate. Four permission states are covered on desktop,
iPhone, Android, and tablet, including the hidden state for viewers without
request access and the mobile link's clearance above the fixed tabs. Baseline
and candidate captures are retained under
`/mnt/disks/scratch/codex-task-scratch/lumen-issue-reporters/swipe-navigation/`.

A separate four-viewport regression check now verifies that the administrator's
global disable switch removes Swipe from both the desktop sidebar and the You
page even for a requester. This fixture covers standalone Lumen; the existing
permission matrix also runs against the production bundled deployment.

The production build and four browser checks passed with synthetic movie
recommendations across desktop, iPhone 13, Pixel 7, and iPad Pro 11. The checks
covered request payloads, pass, and undo. Dedicated browser cases also cover
catalog decks, gesture and keyboard controls, decision history, preference
editing, and Swipe administration. The full Swipe and admin-Swipe suites passed
44 cases in the standalone and freshly built bundled deployments across all
four viewports. Live provider behavior and matched native visual review remain
open.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-swipe-20261118/`.

Swipe preferences now save series season defaults, book format, recommendation
sources, and taste notes. The active deck uses the saved profile immediately.
Compared collapsed and expanded settings across desktop, iPhone 13, Pixel 7,
and iPad Pro 11. The build and eight synthetic browser checks passed,
including an all-seasons request from the active deck after saving. Selected
Favorites is implemented and covered in the following increment; real library
ranking and live provider behavior remain unverified.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-swipe-prefs-20261118/`.

Selected Favorites now loads account-scoped movie, series, and book candidates
and saves a selection of up to 25 titles. Previously saved titles remain
selectable in their eligible categories even when absent from the options.
The production build and eight browser checks passed using synthetic
responses. Compared the favorite picker with the previous preferences form
on desktop, iPhone 13, Pixel 7, and iPad Pro 11. The check verified the selected
series identity in the save payload. Live library ranking was outside this check.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-swipe-favorites-20261118/`.

Swipe History now lists decisions by category, restores individual passed or
seen titles, and clears those decisions after confirmation. Requested titles
link to Requests. Compared the history and deck views on desktop, iPhone 13,
Pixel 7, and iPad Pro 11. The production build and eight browser checks passed
using synthetic responses, including category-scoped clearing and preservation
of requested titles. Live account history was outside this check.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-swipe-history-20261118/`.

The recommendation deck supports keyboard shortcuts when the shortcut region
has focus and directional touch gestures on the title and artwork. Compared
the deck before and after on desktop, iPhone 13, Pixel 7, and iPad Pro 11.
The production build and 12 browser checks passed with synthetic data.
Browser input covered keyboard request and undo, desktop keyboard pass, and
touch pass in the three emulated touch viewports.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-swipe-input-20261118/`.

Swipe adds catalog decks for audiobooks, comics, magazines, music, sports, and
adult media when the server allows those categories. Native and Lumen share
catalog normalization. Compared the magazine deck with the movie deck at
desktop, iPhone 13, Pixel 7, and iPad Pro 11 sizes. The production build, 29
native catalog tests, and 16 browser checks passed. The browser fixture covered
prior-decision filtering, magazine destination, and pagination. Software decks,
catalog filters, and live catalog verification remain open.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-swipe-catalog-20261118/`.

Swipe exposes title search above its expandable deck filters; the advanced
filters retain the applied query while changing genre, publisher, year, rating,
or magazine source. Reset clears both search and advanced filters. Applying
either form resets catalog pagination. The production build and four browser
viewport projects (desktop, iPhone, Android, tablet) passed against synthetic
responses. Compared baseline and candidate at matching viewports. The browser
fixture verified public-catalog query parameters, retained search, and filtered
pagination. Live catalog/provider effects and native matched-state rendering
remain unverified; the mounted workflow is covered by the current bundled
Swipe regression suite.

Evidence is retained under
`/mnt/disks/scratch/codex-task-scratch/lumen-swipe-search-duplicate.Px1n2C/`.

Swipe opens the permitted retro games, apps, and PC games decks. Software
requests use the selected system or OS and architecture, and the deck follows
the server's page continuation. Native and Lumen share the request payload
builder. The existing suite covers PC target selection, offset pagination, and
title-search cursor continuation. A focused four-viewport browser case now
also verifies a software genre filter, all three category-specific target
payloads, and request submission for Retro, Modern, and PC Game cards. Captures
at desktop, iPhone, Android, and tablet show the selected target and request
actions after scrolling them into view; the fixed mobile tabs clear the action
row. The production build passed, and the software decks also passed in the
current bundled Swipe regression suite. Live acquisition effects remain
unverified.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-swipe-software-20261118/`.
The new viewport captures are retained under
`/mnt/disks/scratch/codex-task-scratch/lumen-issue-reporters/swipe-software/final/`.

### Watch sessions

Lumen lists private movie sessions, creates a draft with ranking, release year,
and rating filters, displays room membership, and lets users opt in to
watchlist contributions before the host starts. The production build and four
fixture browser checks passed for creation and preference readback. Inspected
the create and room states on desktop, iPhone 13, Pixel 7, and iPad Pro 11.
Genre selection, invitations, membership management, ballots, and matches are
covered in the following increments; live provider playback and cross-device
use remain open.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-watch-sessions-20261118/`.

Hosts can create, copy, and revoke watch-session invitations. Guests can accept
the fragment-token link and open the room. Compared empty and populated
invitation states across desktop, iPhone 13, Pixel 7, and iPad Pro 11. The
production build and four fixture browser checks passed, including creating,
revoking, and accepting an invitation under distinct simulated accounts.
Live sign-in redirects and multi-user sessions remain unverified.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-watch-invites-20261118/`.

Active watch sessions now offer private movie ballots, vote changes, and
unanimous matches with links to the movie pages. Compared draft and active
rooms on desktop, iPhone 13, Pixel 7, and iPad Pro 11. The production build and
eight fixture browser checks passed, including changing a vote and refreshing
the corresponding match. Live household voting and playback were outside
this check.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-watch-ballots-20261118/`.

Hosts can remove a guest or end the room, and guests can leave. Destructive
changes require confirmation. The room can refresh membership, and returns to
the list if the server reports closure. Compared draft room states on desktop,
iPhone 13, Pixel 7, and iPad Pro 11. The production build and 12 browser checks
passed with synthetic responses, including removal and server-reported closure.
The watch-session suite also verifies that host closure, guest departure, and
guest removal each require confirmation, use the expected endpoint, and return
to the session list after success; all 20 fixture cases passed on desktop,
iPhone, Android, and tablet. Live provider playback and cross-device use remain
unverified.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-watch-members-20261118/`.

Watch-session hosts can choose up to five movie genres on creation and edit
the title, ranking, genres, release years, and rating while the room is a
draft. The shared form preserves previously selected genres. Compared
creation and editing at desktop, iPhone 13, Pixel 7, and iPad Pro 11 sizes.
The production build and 12 fixture browser checks passed, including editing
and saving the genre selection.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-watch-genres-20261118/`.

The watch-session browser suite now covers room creation and editing,
invitations, ballots and matches, and confirmed guest removal, host closure,
and guest departure. It follows a group match to the movie page and checks the
Jellyfin playback link. All 20 synthetic browser checks passed against both
standalone Vite and the freshly built bundled Express `/lumen/` mount across
desktop, iPhone, Android, and tablet. The production build and all 15 isolated
watch-session server tests passed. Live provider playback and cross-device use
remain unverified.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-watch-verify-20261118/`.

Request rows now use the shared live download stream for the selected media
copy, with scheduled progress retained as a fallback. The requester's opaque
ID is preferred, and raw torrent hashes are limited to administrators.
Requester pagination also tolerates responses without pagination metadata.
Compared the scheduled and updated progress states on desktop, iPhone 13,
Pixel 7, and iPad Pro 11. The production build, eight store tests, and all
80 request-status browser checks passed. Actual download clients and live
progress on movie or series detail pages remain outside this check.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-live-progress-20261118/`.

Movie and series details now use the same live progress stream as Requests.
Movie badges show separate HD and 4K progress, and series progress follows the
selected quality. Compared scheduled and live states on desktop, iPhone 13,
Pixel 7, and iPad Pro 11. The production build and 112 browser checks passed
with synthetic streams. Real download-client connections remain unverified.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-live-details-20261118/`.

Ebook and audiobook details subscribe to the selected format's download queue.
The existing status badge and request button show scheduled progress until the
live stream provides an update. Audiobook details use the audiobook queue for
both states. The production build and 72 browser fixture checks passed.
Compared scheduled and live states on desktop, iPhone 13, Pixel 7, and iPad
Pro 11. Real client connections remain unverified.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-book-progress-20261118/`.

Album details also update the existing status badge and request button from
the live stream. The production build and 20 detail browser checks passed.
Compared scheduled and live album states on desktop, iPhone 13, Pixel 7, and
iPad Pro 11. The fixture simulated the server stream.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-album-progress-20261118/`.

Adult scene details show live Whisparr download progress. The request action
uses progress for its own destination when the viewed scene uses a different
service. Compared scheduled and live scene states on desktop, iPhone 13,
Pixel 7, and iPad Pro 11. The production build and 24 detail browser checks
passed with synthetic streams. A separate destination's live update and real
Whisparr connections remain unverified.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-scene-progress-20261118/`.

Comic details now calculate download percentages from valid byte counts as
well as explicit provider percentages. The selected edition keeps its own
progress. Compared matching fixture states on desktop, iPhone 13, Pixel 7,
and iPad Pro 11. Both production builds and 17 candidate browser checks
passed. This uses the scheduled queue data, and live comic streams remain
outside this check.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-comic-progress-20261118/`.

Open comic details refresh scheduled queue data once a minute while the
selected edition is pending or processing, or while a partially available
edition has downloads. Hidden tabs skip refreshes. A failed refresh preserves
the last progress, and polling stops after completion. Compared the same
fixture and four viewports against the preceding comic progress milestone.
The browser fixture advances the clock and verifies failure, recovery, and
completion without navigation. Real provider round trips are unverified.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-comic-refresh-20261118/`.

The Administration entry in the sidebar and You now opens Lumen's own
`/admin` directory. It lists every registered administrator tools page,
including System Caches and Users. You shares the settings list and retains
the Full SeerrNG link, including its configured companion destination.
Delegated user managers retain their separate Users link. Direct access to
the directory requires administrator permissions.

Compared You and Discover before and after at desktop, iPhone 13, Pixel 7,
and iPad Pro 11 sizes and inspected the new directory in those viewports.
Both production builds passed, as did 48 candidate browser checks with
synthetic responses. Published image routing was outside this check.
Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-entry-20261118/`.

Standalone Swipe bookmarks now serve the Lumen app instead of redirecting
to classic SeerrNG. On bundled installations that lock members to Lumen,
the legacy Swipe path opens the Lumen deck. Explicit bundled
`/lumen/settings/services` bookmarks now open the Lumen administration
directory. Verified two server tests and ten tests against the built
standalone proxy image, including direct requests to the Swipe and admin
entry points. The previous browser fixtures cover rendering inside the app.

Plex and Jellyfin connection settings are available in Administration → Media
Server Libraries. The page includes the shared connection editor, Plex server
discovery, Jellyfin bridge sign-in, Tautulli settings, library management, and
scan controls. The standalone proxy and bundled Express frontend route the
legacy Plex and Jellyfin settings bookmarks to this page. On `d15b3720a`, the
production build and 24 browser cases passed across desktop, iPhone, Android,
and tablet. The fixtures cover Plex discovery and save, Jellyfin credential
preservation and bridge sign-in, Tautulli save and disconnect, and library and
scan actions for Plex, Jellyfin, and Emby. They do not exercise live provider
writes or compare the pages against matched native settings renders.
Members, request managers, and library managers cannot load this admin route
or trigger protected provider-settings reads in standalone fixtures.
The Jellyfin connection case also verifies that a rejected save keeps the
edited settings available and that retry succeeds without losing the redacted
saved credential.

The remaining Services workflows have dedicated Administration pages for
software acquisition, reader delivery, recognition, Tunerr, request override
rules, and connection hosts. Their validation is tracked with each page below;
the presence of an Administration route alone does not establish behavioral
parity.

Administration now includes Share and Image Recognition. The page uses the
existing administrator API to configure Share to Request, local OCR, vision
providers, and the image limit. Changing the provider or its URL asks for
consent again. Saved API keys stay out of the form and unrelated save payloads,
and can be removed explicitly. Rejected saves keep the draft.

Compared the new form with the existing Swipe provider form at desktop,
iPhone 13, Pixel 7, and iPad Pro 11 sizes. The production build and 44 browser
fixture checks passed, including permission denial and rejected-save recovery.
No real image or credential was sent. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-recognition-20261118/`.

Lumen Administration now has Reader Delivery settings for Grimmory and
BookOrbit, including credentials, preferred reader, OPDS and Komga addresses,
and tests against saved connections. Administrators can inspect managed shelf
status and remove a shelf after confirmation. Managed shelf actions are
available on eligible comic and manga editions, authors, and book series in
the later increments below; their production behavior is covered there.

Compared the configured form with the existing Lumen provider form on
desktop, iPhone 13, Pixel 7, and iPad Pro 11. The production build and 44
browser fixture checks passed, including failed-save recovery, secret
preservation, connection testing, and canceling and confirming shelf removal.
Real reader connections were outside this check. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-reader-delivery-20261118/`.

Comic and manga details now open Reader Shelf setup for the selected edition.
Administrators can preview matches, set visibility, enable BookOrbit Kobo
sync, and create or update the shelf. Empty previews require explicit consent.
The fallback provider is used when the preferred reader has no address.
The result distinguishes verified counts from previews. The earlier statement
that author and book-series routes needed coverage is superseded by the
following book-grouping increment; both routes expose this action when the
viewer is an administrator.

The production build, 13 reader-delivery API tests, and 21 browser checks
passed, with three existing viewport skips. Inspected the shelf sheet and
surrounding comic detail at desktop, iPhone 13, Pixel 7, and iPad Pro 11
sizes. The fixtures verified the exact selected edition and empty-shelf
consent. Real providers were outside the check. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-reader-shelf-20261118/`.

Book details now link to Lumen author bibliographies and book series when
the API supplies their identities. Author pages support forward and backward
pagination, and series pages order books by their series position. Both
pages reuse the Reader Shelf action. Direct links work with the standalone
proxy and with the bundled Lumen lock. Bulk requests and series filters are
implemented in the following increments; this earlier gap statement is
superseded by those entries.

The production build, 28 browser checks, two server routing tests, and ten
built-image proxy tests passed. Inspected the new pages against Lumen's book
detail and book grid layouts across desktop, iPhone 13, Pixel 7, and iPad
Pro 11. Browser fixtures checked pagination, order, and shelf preview
identities. The focused regression now previews and creates author and series
shelves and checks the exact target, provider, visibility, and empty-shelf
consent payload on desktop, iPhone, Android, and tablet; all 12 cases pass.
The combined book-grouping and request-status suite passes all 108 cases in
both standalone and Express-mounted deployments. Bundled screenshots and the
isolated server logs are retained under
`/mnt/disks/scratch/codex-task-scratch/seerrng-lumen-bundled-parity-20261119/`.
Real reader providers and matched native visual acceptance remain unverified.
Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-book-grouping-20261118/`.

Lumen book series now filter by format, publication year, subject, minimum
rating, and language. The format filter retains untracked books and keeps
each selected format's detail links. Clearing the filters restores reading
order. Subject and language choices come from the returned books, and filter
state is local to the series page.

Compared the previous, unfiltered and filtered states on desktop, iPhone 13,
Pixel 7, and iPad Pro 11. The production build and 32 browser checks passed,
including combined filters, the empty state, reset, and audiobook links.
Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-series-filters-20261118/`.

Author and series pages can submit bulk ebook or audiobook requests through
the existing bulk API. Author selections can span bibliography pages.
The sheet submits up to 100 titles per batch using normal request defaults,
preserves selections after rejection, and reports created, skipped, and
failed results. Advanced destination overrides are covered in the following
increment; the earlier status is superseded by that implementation.

The production build, 18 bulk API tests, and 36 browser checks passed.
Compared the new sheet with existing Lumen dialog geometry on desktop,
iPhone 13, Pixel 7, and iPad Pro 11. Browser fixtures verified exact book
and edition IDs, pagination, quota rejection, and partial results. Real
provider requests were outside the check. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-bulk-books-20261118/`.

Bulk book requests now offer advanced destinations to authorized users.
The sheet lists services compatible with the selected format and exposes
available quality and metadata profiles, root folders, and tags. Changing
the service or format clears its overrides. Delegated users with both
required permissions can select the requester. The default route continues
to use configured server defaults.

The production build and 12 browser checks passed. Compared default and
expanded sheets on desktop, iPhone 13, Pixel 7, and iPad Pro 11. Fixtures
verified format changes and the submitted destination, profiles, folder, tags,
and requester. Real service writes were outside the check. Evidence is
retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-bulk-destinations-20261118/`.

Ebook, audiobook, comic, and magazine detail pages now open the configured
Grimmory or BookOrbit library. The links use the server-selected reader and
its browser address, including legacy addresses ending in OPDS or Komga
paths. Unsafe addresses are omitted. The action opens the library, where
readers can choose a title.

The production build and 56 browser fixture checks passed. Compared the
same routes with and without usable reader addresses on desktop, iPhone 13,
Pixel 7, and iPad Pro 11. Fixtures verify the destination and new-tab
behavior. Live provider playback was outside this check. Evidence is retained
under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-reader-links-20261118/`.

Lumen Administration now exposes Tunerr connection settings, separate deck
and XMLTV guide diagnostics, and Sportarr feed status and synchronization.
Sportarr writes use saved settings and require a reachable service with
Tunerr sports automation enabled. Saved deck passwords stay out of unrelated
save and test payloads. The live TV guide and recording workflows remain
separate parity work.

The production build, eight Tunerr server tests, and 36 browser fixture
checks passed. Compared against Lumen's existing provider settings form
on desktop, iPhone 13, Pixel 7, and iPad Pro 11. Fixtures checked partial
diagnostics, password preservation, and feed-link readback. Real Tunerr and
Sportarr connections were outside the check. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-tunerr-20261118/`.

Lumen now opens Recordings from the sidebar and You when Tunerr is
configured. The page lists active requests or history, supports the
authorized all-users scope, and refreshes while visible. Approval, decline,
and cancellation use the existing permissions and confirmation sheet.
Standalone and bundled locked deep links resolve to the new page.

The production build, 48 browser fixture checks, seven server tests, and
ten built-image proxy tests passed. Inspected the recording rows and filters
against existing Lumen list controls on desktop, iPhone 13, Pixel 7, and
iPad Pro 11. Fixtures verified manager approval and member cancellation
with history readback. Creating recordings from guide matches and live
provider verification remain open. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-recordings-20261118/`.

Movie and series details now open a Live TV airings sheet when Tunerr is
configured. Opening the sheet looks up the localized and original titles.
Users with recording access can request a specific channel and start time
or a series rule and then open Recordings. The sheet distinguishes requests
awaiting approval from scheduled recordings and can retry a warming guide.

The production build and 44 browser fixture checks passed. Inspected the
movie and series sheets on desktop, iPhone 13, Pixel 7, and iPad Pro 11.
Fixtures verified deferred guide reads, exact recording payloads, and return
to Recordings. Actual broadcasts and Sportarr team follows were outside the
check. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-airings-20261118/`.

Recordings now includes Followed Teams, with a shortcut from Sports.
The control uses Tunerr's team catalog and preserves the exact dataset and
team name. Users with recording access can add follows, and users can
remove their existing follows. Each successful action reloads the saved
list. The server retains authority over recording approval and the team limit.

The production build and 24 browser tests passed. Compared the recording
layout with the added team controls on desktop, iPhone 13, Pixel 7, and iPad
Pro 11. Fixtures verified rejection recovery, exact follow identity, and
follow and unfollow readback. Live Tunerr scheduling was outside the check.
Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-team-follows-20261118/`.

Lumen Administration now includes Software Acquisition. Administrators can
test and save ROMarrNG and QuestarrNG connections, choose the emulation
catalog, assign Retro and Modern groups, preview and override IGDB platform
matches, and configure the Steam Web API key. A failed save preserves the
draft, and existing keys stay out of unrelated requests.

Compared the provider form with Lumen's existing service settings on
desktop, iPhone 13, Pixel 7, and iPad Pro 11. The production build, three
focused server tests, and 36 browser fixture checks passed. Fixtures verified
the connection test, rejected-save recovery, and platform settings payload.
Live provider connections were outside the check. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-software-admin-20261118/`.

Legacy software bookmarks now resolve inside standalone Lumen and bundled
Lumen when the native interface is locked. The redirect retains catalog
search and category or opens the exact IGDB or DAT game. Game details now
read the catalog endpoint's wrapped result and still accept older direct
results. Verified the production build, 12 browser checks, two server
routing tests, and ten built-image proxy tests. Inspected IGDB and DAT game
details at desktop, iPhone 13, Pixel 7, and iPad Pro 11 sizes. Live catalog
providers were outside the check. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-software-bookmarks-20261118/`.

Game detail state now follows the exact category, catalog, and title.
Changing any of those clears old request selections and status. A failed
catalog lookup can be retried on the same page. The production build and
12 browser checks passed. The browser fixture moved between two PC titles
in the same session, retried the second lookup, and verified the second
title's requested variant. Inspected the new retry state against the
existing Lumen service-error layout in four viewports. Live provider writes
were outside the check. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-game-identity-20261118/`.

Lumen can browse curated series collections and artist discographies.
Series details load collection names on expansion. Album and artist details
link to the discography, and album-origin visits can return to that album.
Direct bookmarks resolve in standalone and bundled locked deployments.
The collection workflows now include selected-release requests, progressive
movie requests, shared-availability refresh, and movie/TV and music release
filters. Native matched comparison for video collection filters and additional
request overrides remains open, as does live playback and acquisition.

The production build, 28 browser checks, two server routing tests, and
ten built-image proxy tests passed. Inspected series and discography grids
using shared Lumen detail and card layouts across four viewports. Live
catalog providers were outside the check. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-curated-collections-20261118/`.
The complete `collection.spec.ts` browser file was rerun on the current head:
20 fixture cases passed across desktop, iPhone, Android, and tablet, covering
collection entry and blocklist actions, progressive queue start/stop/restart,
bulk request outcomes, collection playback, and media-server sync. Live
provider behavior remains outside this fixture run.

Curated collections now check availability while visible and online on
supported media servers. Pending collections recheck on a one-minute
cadence and offer a manual refresh after failures. The result updates only
members already authorized by the catalog read. Artist discographies keep
their existing read-only availability behavior. The refresh leaves unrelated
frontend caches intact.

The production build and 28 browser fixture checks passed. Compared the
series collection before and after on desktop, iPhone 13, Pixel 7, and iPad
Pro 11. The fixture verified failure recovery, updated availability, and
exclusion of a title absent from the authorized catalog. Live provider
refresh remains unverified. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-curated-availability-20261118/`.

Music collections and artist discographies now filter releases by type,
genre, or year. The initial Album view excludes secondary types such as
Live releases. The filters combine, distinguish unknown years, and can
be cleared to show the full catalog.

The production build and 28 browser checks passed. Compared the prior and
filtered discography layouts in four viewports. The fixtures verified
secondary release types, combined filters, no matches, and clearing.
Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-music-collection-filters-20261118/`.

Music collections and artist discographies can request selected releases in
MP3 or FLAC through the configured Lidarr service. The request sheet uses
the current filters, excludes blocklisted releases and releases already
available in the selected quality, and reports individual failures.

The production build and 28 browser checks passed. Compared the request
sheet with the existing book request sheet on desktop, iPhone 13, Pixel 7,
and iPad Pro 11. The fixture verified FLAC routing and exclusion of an
owned FLAC release. Live Lidarr delivery remains unverified. Evidence is
retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-music-collection-requests-20261118/`.

Curated TV collections can submit requests for selected series in HD or
4K as permitted by the server and account. The sheet checks the requester's
season quota, uses the existing Sonarr destination controls, and excludes
covered seasons and episodes when calculating partial requests. It reports
results per series and offers a retry when details fail to load. Series
without a TVDB match still use the individual request flow.

The production build and 28 browser checks passed. The HD fixture verifies
that the payload excludes specials, an owned season, an owned episode, and
an actively requested episode. Compared the prior and updated collections
and inspected the open request sheet on desktop, iPhone 13, Pixel 7, and
iPad Pro 11. Live Sonarr, alternate requesters and 4K submissions remain
unverified. Native video collection filters and additional request
overrides still need parity review. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-tv-collection-requests-20261118/`.

Movie and TV collection request sheets now filter by release year, genre,
minimum rating, and original language. TV also filters by series status.
Only visible, eligible selections are submitted. The curated TV catalog
now includes status and language for both frontends. Lumen falls back
to series details when connected to an older API.

The production Lumen build, 20 browser fixture checks, and targeted
collection provider and name tests passed. Compared movie and TV request
sheets with their prior versions on desktop, iPhone 13, Pixel 7, and iPad
Pro 11. The fixtures cover combined movie filters, no matches, clearing
filters, TV status from series details, and the existing request payloads.
Live metadata providers were outside the comparison. Evidence is retained
under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-video-filters-20261118/`,
`seerrng-lumen-video-filters-baseline-20261118/`, and
`seerrng-lumen-tv-filters-20261118/` in the same scratch directory.

Lumen's shared advanced TV request controls now show legacy language
profiles or metadata languages when the selected Sonarr server advertises
them. Changing servers resets server-specific selections. The request
editor restores supported saved values and can reset metadata language
to the Sonarr default.

The Lumen production build and 48 browser checks passed. Compared the
expanded series detail controls before and after on desktop, iPhone 13,
Pixel 7, and iPad Pro 11. The request fixture switches between servers
with different capabilities, verifies the metadata language payload,
and checks that the legacy profile does not leak into that payload.
Live Sonarr delivery and persisted edits were outside the check.
Evidence is retained in the `seerrng-lumen-sonarr-language*` outputs
under `/mnt/disks/scratch/task-deliverables/`.

Lumen's advanced movie and TV request controls can customize Radarr and
Sonarr destination tags. The picker shows the selected service's defaults,
restores compatible saved tags for request edits, and resets when the
destination changes. New requests distinguish explicit tag changes,
including an empty list, from leaving destination rules in control.
The edit payload omits the create-only options marker.

The production build and 48 browser checks passed. Compared expanded TV
request controls before and after on desktop, iPhone 13, Pixel 7, and
iPad Pro 11. The fixture verified tag defaults, changing destinations,
and explicitly removing all tags from a new request. Live Radarr and
Sonarr delivery and persistence of edited tags remain unverified.
Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-tags-final-20261118/`.

Lumen's advanced single-series request, quick request, and edit controls
offer Sonarr season ordering when the matching TVDB series advertises
multiple orders. The lookup follows the destination, quality, and metadata
language. Changing the destination or metadata language resets the
selection. Collection-wide options remain shared across series and omit
this title-specific override.

The production build and 48 browser checks passed. Compared expanded
TV detail controls with the previous version on desktop, iPhone 13,
Pixel 7, and iPad Pro 11. The fixture verifies TVDB matching, language
and destination changes, and the selected order in the request payload.
Live Sonarr remapping and request edit persistence remain unverified.
Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-sonarr-order-20261118/`.

Lumen's episode request sheet now matches the native multi-season selection
workflow. It loads season metadata in batches of three, retries missing seasons
serially, preserves a deep-linked episode through recovery, and requires
complete metadata before selections can change or submit. Users can expand and
collapse seasons, clear the selection, and submit selected episodes from
multiple seasons in one `seasonRequests` payload. Availability, pending
requests, quality, quota, and streaming-policy checks continue to come from
their existing owners. Focused large-series recovery, multi-season payload,
bookmark, partial-request, and localized recovery cases passed across desktop,
iPhone, Android, and tablet (36 checks). Matching baseline/candidate captures
were inspected at desktop and iPhone sizes; the shared sheet remains scrollable
on phone. Provider failures are fixture-driven, so live TMDB/Sonarr behavior
remains unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-multiseason-episode-picker-20261122/`.

Accounts with Advanced Requests can now choose movie and TV request
destinations and set the quick-request preference. Manage Requests still
controls management surfaces and pending counts. Requesting on behalf
of another user still requires the separate management permissions.

The production build and 24 focused browser checks passed on desktop,
iPhone 13, Pixel 7, and iPad Pro 11. Compared the Requesting preferences
and advanced TV detail controls with the previous version. The fixture
verifies an advanced requester can submit destination options without
loading management data. A broader run produced 429 passes, seven skips,
and 12 failures. The same failures reproduced on the previous commit:
exporting Lumen configuration, retrying a failed browse page, and changing
filters after a stale browse failure, across four viewports. Baseline and
candidate evidence is retained under `seerrng-lumen-advanced-permission*`
in `/mnt/disks/scratch/task-deliverables/`.

The Lumen configuration export and browse recovery failures reported
above were caused by stale test setup. The export test now uses the named
administration link. Browse fixtures serve language and country metadata,
and the paging retry targets the result-list error. All 12 previously
failing checks pass across the four viewports. This milestone changes only
browser verification.
The broader admin options, review pages, and TV request suite then passed
with 441 checks and seven skips. The log is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-browser-fixtures-suite-20261118.log`.

Advanced movie and TV requests expose Ignore Request Quota when the
actor and selected requester can manage requests and the targeted quota
has a limit. The opt-in resets when the requester changes. The TV
collection sheet uses the override for selection and submission gating.
The server continues to authorize and enforce the override.

The production build and 24 focused browser checks passed. Compared
the quick-request sheet before and after the quota loaded, and inspected
the enabled TV collection sheet on desktop, iPhone 13, Pixel 7, and iPad
Pro 11. Fixtures verify the requester-change reset, the quota-blocked
batch, and the explicit override in the outgoing payload. Live quota
and provider round trips were outside the check. Evidence is retained
under `seerrng-lumen-quota-override*` in
`/mnt/disks/scratch/task-deliverables/`.

Movie and TV detail pages offer Request Approval for a viewer's own
over-quota requests. TV compares the selected season count with the
remaining quota. Lumen sends an explicit approval request and uses
the returned quota exception to confirm it. The server retains
responsibility for validating the exception and checking duplicates.

The production build and 20 focused browser checks passed. Compared
the movie and TV detail actions with the previous version on desktop,
iPhone 13, Pixel 7, and iPad Pro 11. Fixtures verify payloads and
confirmation for both media types. Live quota enforcement and approval
are outside this check. Poster quick requests and manager-facing
exception identification are covered in the following increments.
Evidence is retained
under `seerrng-lumen-quota-approval*` in
`/mnt/disks/scratch/task-deliverables/`.

Pending quota exceptions are marked Over Quota in Lumen's request
list and request history. The label uses the authorized request record and
disappears once the request leaves pending status.

The production build and 12 focused browser checks passed. Compared
the request list and history with the previous version on desktop,
iPhone 13, Pixel 7, and iPad Pro 11. The manager fixture verifies both
labels and the existing approve and decline actions. Live moderation
was outside the check. Evidence is retained under
`seerrng-lumen-quota-review*` in `/mnt/disks/scratch/task-deliverables/`.

Movie and TV poster quick requests now open an approval sheet after a
quota denial. Successful requests retain the one-click flow. The user
must confirm the exception before Lumen submits it. The request API
returns a machine-readable quota code, and Lumen also recognizes the
existing movie and series quota messages from older server versions.

The production build, 16 focused browser checks, and two server quota
contract checks passed. Compared the approval sheet with the existing
quick-request sheet on desktop, iPhone 13, Pixel 7, and iPad Pro 11.
The fixture checks that only the explicitly confirmed write carries
the approval flag. Live provider delivery and moderation were outside
the check. Evidence is retained under `seerrng-lumen-poster-quota*`
in `/mnt/disks/scratch/task-deliverables/`.

Coming Soon rows now open the shared approval sheet when a direct
movie or TV request exceeds quota. Successful direct requests keep the
existing one-click behavior.

The production build and six applicable browser checks passed, with
six viewport-specific skips. Compared the Coming Soon list and approval
sheet on desktop, iPhone 13, Pixel 7, and iPad Pro 11. The fixture covers
the older quota-error response, explicit approval, and the row's
requested state after success. Live approval remains unverified.
Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-soon-quota-20261118/`.

The TV request editor preserves saved episode selections when changing
a destination or adding a season. Declined seasons start unselected.
Specials appear when enabled or already included in the request.

The production build and 12 focused browser checks passed. Compared the
edit sheet before and after on desktop, iPhone 13, Pixel 7, and iPad Pro 11. The fixture verifies that saving a newly selected season retains
the existing episode IDs in the same payload. Live Sonarr delivery was
outside the check. Evidence is retained under
`seerrng-lumen-preserve-episodes*` in `/mnt/disks/scratch/task-deliverables/`.

TV detail pages now offer an episode request sheet when partial requests
are enabled. The sheet submits exact episode IDs for one season, including
eligible episodes in a season with an existing partial request. It checks
the current quality, known availability, and active requests before
submission. The existing season request flow remains available.

The production build and 36 browser checks passed. Compared the Seasons
section and inspected the new sheet on desktop, iPhone 13, Pixel 7, and
iPad Pro 11. The fixture verifies that an owned episode and a pending
episode cannot be selected, and the exact missing episode is submitted.
Live provider delivery was outside the check. Evidence is retained under
`seerrng-lumen-episode-request*` in `/mnt/disks/scratch/task-deliverables/`.

The episode picker confirms success only when the server returns a
request ID. A no-episodes-added response keeps the selection and shows
a retryable message. The picker prevents concurrent submissions and
respects the 4K blocklist state.

The production build and 36 browser checks passed. The fixture exercises
the no-op response followed by a confirmed submission of the same episode
IDs. Compared the sheet with and without the message on desktop, iPhone
13, Pixel 7, and iPad Pro 11. Live Sonarr was outside the check. Evidence
is retained under `seerrng-lumen-episode-confirmation*` in
`/mnt/disks/scratch/task-deliverables/`.

TV collection results count a series as requested only after SeerrNG
returns a request ID. A response adding no seasons is reported against the
affected series. Closing the results refreshes the collection.

The production build and eight browser checks passed. Compared the result
sheet before and after on desktop, iPhone 13, Pixel 7, and iPad Pro 11.
Fixtures cover both a no-op response and a confirmed request. Live Sonarr
was outside the check. Evidence is retained under
`seerrng-lumen-collection-confirmation*` in
`/mnt/disks/scratch/task-deliverables/`.

The shared TV request client now requires a confirmed request ID.
Season, episode, poster, Coming Soon, and TV collection callers using
that client no longer treat a no-op response as a successful request.
TV details preserve the season selection after a no-op.

The production build and browser suite passed with 139 checks and nine
skips. Compared the TV detail notification before and after on desktop,
iPhone 13, Pixel 7, and iPad Pro 11. Evidence is retained under
`seerrng-lumen-series-confirmation*` in
`/mnt/disks/scratch/task-deliverables/`.

Swipe and Share now use the shared TV request confirmation. Swipe retains
the card without writing a decision when no seasons were added. Share
counts only the confirmed requests in a mixed batch and leaves the
unconfirmed series available to retry.

The production build and 24 browser checks passed. Compared Swipe and
Share before and after on desktop, iPhone 13, Pixel 7, and iPad Pro 11.
Fixtures cover a no-op followed by a confirmed request in both workflows.
Live provider delivery was outside the check. Evidence is retained under
`seerrng-lumen-share-swipe-baseline-20261118/`,
`seerrng-lumen-swipe-series-confirmation-20261118/`, and
`seerrng-lumen-share-series-confirmation-20261118/` in
`/mnt/disks/scratch/task-deliverables/`.

The shared artwork URL helper validates raw same-origin paths before the
browser can normalize them. Valid proxy URLs keep their query strings.
The production build and 28 Swipe and curated collection browser checks
passed. Compared Swipe cards on desktop, iPhone 13, Pixel 7, and iPad
Pro 11 and verified that a control character in an artwork path causes
the image to be omitted. A regular proxy image still renders. GitHub code-scanning alert 690 was
dismissed as a false positive: this sink is an image `src`, not a page
navigation, and the shared artwork URL validator restricts accepted origins.
Evidence is retained under `seerrng-lumen-art-url*` in
`/mnt/disks/scratch/task-deliverables/`.

Movie trailers now use a fixed YouTube watch origin and a validated
video ID. If a trailer has no valid ID, Lumen checks the next trailer
candidate. Compared movie detail pages before and after on desktop,
iPhone 13, Pixel 7, and iPad Pro 11. The production build and 28 detail
browser checks passed. The trailer fixture verifies the generated
destination and omission of invalid candidates. GitHub code-scanning alert
670 is fixed. Evidence is retained under `seerrng-lumen-trailer-url*`
in `/mnt/disks/scratch/task-deliverables/`.

Reader service links now share absolute HTTP(S) address validation.
Kavita links require the series route generated by SeerrNG and preserve
the configured deployment path. The production build and 16 browser
checks passed. Compared the comic detail page before and after on desktop,
iPhone 13, Pixel 7, and iPad Pro 11. Fixtures verify the mounted-series
link, omission of a non-series destination, and Audiobookshelf and
reader shelf behavior. Evidence is retained under
`seerrng-lumen-reader-url*` in `/mnt/disks/scratch/task-deliverables/`.

Shared detail headers, extra-category cards, and game screenshot galleries
now pass artwork through the shared validator. A game can use its first
valid screenshot as the backdrop even when the API's first entry is
invalid. The production build and 40 browser checks passed. Compared
software detail before and after on desktop, iPhone 13, Pixel 7, and iPad
Pro 11. The fixture verifies valid proxy art and omission of unsupported
image URLs. GitHub code-scanning alerts 654–657 are fixed. Evidence is retained
under `seerrng-lumen-rendered-art*` in `/mnt/disks/scratch/task-deliverables/`.

Bundled Lumen HTML responses now share a per-client budget of 600
requests per minute, matching the existing API budget. Static files,
missing asset responses, and setup redirects do not consume the shell
budget. The existing client IP helper respects the configured proxy
trust boundary. Both frontend routing integration tests passed,
including deep links and the distinction between shell and asset
responses. GitHub code-scanning alert 671 is fixed. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-shell-ratelimit-20261118.log`.

ComicVine description formatting now decodes supported entities in one
pass and renders the result as React text. Compared comic details on
desktop, iPhone 13, Pixel 7, and iPad Pro 11. The production build and
seven browser checks passed, with nine responsive-test skips. GitHub
code-scanning alert 647 is fixed. Evidence is retained under
`seerrng-lumen-comic-text*` in `/mnt/disks/scratch/task-deliverables/`.

Shared card covers and the request card's decorative image now validate
artwork with the existing Lumen URL helper. The request fixture showed
four image elements on the baseline, including two with the unsupported
HTTP destination. The candidate kept the two elements for the valid
proxy cover and used the drawn fallback for the other card. The production
build and 48 browser checks passed across desktop, iPhone 13, Pixel 7,
and iPad Pro 11. Baseline screenshots and traces are retained under
`seerrng-lumen-cover-regression-baseline-20261118` in
`/mnt/disks/scratch/task-deliverables/`. Alert 662 still refers to the
earlier revision. Live provider artwork was outside this fixture check.

Legacy Services settings bookmarks now open Administration in standalone
Lumen, matching bundled Lumen. The legacy Prowlarr search target opens
Prowlarr Settings directly in either deployment. The existing screen
routes retain their permission checks. Both Express tests and all ten
companion production-image tests passed, including the redirect checks.

Plex and Jellyfin/Emby settings bookmarks now open Media Server
Libraries in both deployments. The existing screen selects the
active provider. The Express and companion production-image suites
verify the redirects.

Existing book series links under `/series/` now open the matching
Lumen book series in the standalone companion and under the bundled
frontend lock. The redirect retains the service, series, and optional
author identity. Both Express tests and all ten production companion
image tests passed, including the encoded bookmark.

### Native entry points and remaining verification

These native bookmarks have Lumen destinations. Check behavior and
permissions separately from bookmark routing.

| Native entry point                                  | Behavior still to cover                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/users/[userId]`                                   | Both deployments map the bookmark to `/household/:id`. Browser fixtures cover independent permission checks and recovery for request and watchlist previews. “Edit Settings” routes a user manager to that member's targeted Admin Users editor; the route and profile editor are verified end to end, while regular-user access stays denied.                                                                                                                                                                                                                                                        |
| `/discover/collectors`                              | Lumen now shows trusted collector picks, links to matched albums, and starts artist release follows. The shared cover renders artwork returned by matched albums. Live artwork and matched visual acceptance remain open.                                                                                                                                                                                                                                                                                                                                                                             |
| `/discover/book-recommendations`                    | Both deployments map the bookmark to `/books/recommendations`. Lumen uses the same feed and per-list endpoints for filters and feedback, and retains the format in the URL. Standalone browser fixtures cover creating a personalized feed and applying feedback.                                                                                                                                                                                                                                                                                                                                     |
| `/discover/movies/genres` and `/discover/tv/genres` | Lumen lists genres with artwork from the native backdrop endpoints and links to filtered browse. Live artwork and matched native visual acceptance remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/setup`                                            | Both Lumen deployments open their own first-run setup from their home URL. Administrators can reopen setup from Administration. Lumen has resumable steps, guards unsaved download-client changes, and reviews saved libraries, request services, download clients, and Prowlarr. It groups request-service editors and offers Usenet, torrent, and combined download setup profiles. Twenty fixture browser cases passed in both standalone and freshly built bundled deployments across desktop, iPhone, Android, and tablet. Matched visual acceptance and live provider verification remain open. |

Native SeerrNG exposes Share & Identify from Discover to users with request
access (including administrators). Lumen now provides the same permission-gated
desktop menu entry, a gated Discover shortcut, and a link on the mobile You
page. Twelve focused navigation checks passed across desktop, iPhone, Android, and
tablet. They cover request-only users, admin-only users, and the no-request-
access state, and confirm that the mobile link clears the fixed tab bar after
scrolling. Baseline and candidate screenshots are retained under
`/mnt/disks/scratch/codex-task-scratch/lumen-issue-reporters/share-navigation/`.
This verifies navigation and page rendering with fixtures; live link
recognition, provider behavior, and matched visual acceptance remain open.

The native request-gated Book Recommendations, Collector Picks, Game Finder,
and Translations and Hacks shortcuts are also permission-gated in Lumen's
Books, Music, Games, and retro/console game-detail views. Sixty browser checks
covered viewers, request users, and administrators across desktop, iPhone,
Android, and tablet. Baseline and candidate desktop screenshots are retained
under `/mnt/disks/scratch/codex-task-scratch/lumen-issue-reporters/request-entry-navigation/`
in `baseline/`, `candidate-final/`, `detail-baseline/`, and `detail-final/`.
The screenshots confirm that only the restricted shortcuts disappear for
viewers; provider behavior and matched native visual acceptance remain open.

The Adult category menu follows the native `ADMIN`, `MANAGE_REQUESTS`, or
`REQUEST_ADULT` gate through Lumen's authenticated Adult catalogue probe. Twenty
browser checks across desktop, iPhone, Android, and tablet confirmed the
authorized roles see Adult while viewers with no permission or generic
`REQUEST` do not.

The mobile You page now shows My Games only when at least one supported game
category is enabled for the signed-in account and its catalog is available.
Fixture runs verify global and per-user disabled states make no game-catalog
request, and the enabled state keeps the exact link available. Twelve cases
passed across desktop, iPhone, Android, and tablet in standalone Lumen; the
original eight cases passed in bundled Lumen. Matching
390 × 844 CSS-pixel baseline and candidate screenshots are retained under
`/mnt/disks/scratch/codex-task-scratch/seerrng-lumen-game-navigation-20261119/`.

Request buttons on software game details, album details, and adult-scene
details now follow the native permission masks (`REQUEST`; `REQUEST` or
`REQUEST_MUSIC`; and `ADMIN`, `MANAGE_REQUESTS`, or `REQUEST_ADULT`,
respectively). Forty-four browser checks covered viewers, admins, and each
media-specific request role across desktop, iPhone, Android, and tablet.
Baseline and candidate desktop screens are retained under
`/mnt/disks/scratch/codex-task-scratch/lumen-issue-reporters/request-action-permissions/`.
They show the unsupported request buttons removed while detail and status
content stays in place. Provider behavior and bundled visual acceptance remain
open.

The same audit found request controls on movie and series cards, ebook and
audiobook cards/details, and comic/manga cards/details. Lumen now gates these
actions with each media type's native request permissions, including the
quick-request sheet entry points. One hundred twenty-four browser checks passed
across desktop, iPhone, Android, and tablet for movie and series cards, game,
music, adult, book, and comic detail actions, and book-card actions, covering
no permission and each allowed role. Denied-state baseline/candidate screenshots
for movie, series, ebook, and audiobook cards cover the same four viewports.
Candidate book and comic detail screens are also retained under
`/mnt/disks/scratch/codex-task-scratch/lumen-issue-reporters/request-card-permissions/`
and `/mnt/disks/scratch/codex-task-scratch/lumen-issue-reporters/request-action-permissions/`.
Live provider behavior and broader native visual acceptance remain open.

Issues, Blocklist, and Download Inbox now pass 72 fixture-backed browser cases
per deployment across desktop, iPhone, Android, and tablet, including permission
branches, media identities, reporting and edits, paging, queue history, imports,
and rejection defaults. Watch Sessions separately passes 20 cases per deployment.
These runs establish production-bundled route and interaction behavior, but do
not replace matched native screenshot acceptance or live provider effects.

The household and recommendation browser suites passed 36 cases per
deployment across desktop, iPhone, Android, and tablet. The bundled run
served the production build through the Express mount at `/lumen/`. Both
suites used API fixtures. Live authorization, provider behavior, and
matched visual verification remain open for these targeted checks.

Lumen Movies and Series now link to their genre directories. Legacy
genre-directory bookmarks route to Lumen under bundled frontend lock and
in the companion. The production build, two Express tests, and ten
companion image tests passed. Browser fixtures opened both directories, verified the genre backdrop
proxy and unique-art selection, and followed a genre to its filtered results
on desktop, iPhone 13, Pixel 7, and iPad Pro 11. Matched visual comparison
and live provider states remain unverified.

Genre directories keep their links available when the artwork endpoint
fails. Retry reloads the artwork independently. Four focused fixture
checks passed at 390 and 1440 CSS pixels across standalone and bundled
Lumen. The series fixture recovered from a 503 and opened the filtered
genre after artwork returned. Bundled screenshots covered the retry
notice and restored artwork at both widths.

Movie and series rating sorts now use Classic's default minimum of 50
TMDB votes. Explicit vote filters still take precedence. Eight browser
checks across standalone and bundled Lumen verified the outgoing
catalog queries for a Classic-style movie bookmark, the default series
rating sort, and explicit series vote bounds. The checks used fixtures
at 390 and 1440 CSS pixels.

Movie and series discovery now retain Classic's title search alongside
genre, sort, and the other browse filters. Lumen offers an editable
Title field on both pages and clears it with the discovery filters.
Two server routing tests and four focused browser fixture checks
passed across standalone and bundled Lumen. Bundled screenshots
covered the 390- and 1440-pixel title filter layout.

Title searches in the owned view now use SeerrNG's local catalog
when the existing library sort and filters are supported. Eight
browser fixture checks passed across standalone and bundled Lumen
at 390 and 1440 CSS pixels. The movie cases verified the combined
title and availability request, then returned to the full catalog and
confirmed that explicit title searches show requested matches while
still hiding blocklisted titles.

Saved 4K discovery filters wait for public settings before fetching
results. A failed settings load can be retried without making an HD
request in the meantime. Eight standalone and bundled browser checks
at 390 and 1440 CSS pixels covered bookmark availability and startup
recovery. The recovery fixture confirmed that the first Movies catalog
request used 4K after settings became available. Matched visual review
and live 4K library results remain unverified.

When settings disable 4K, a saved 4K filter shows an explicit option
to load HD results. Eight browser fixture checks passed across
standalone and bundled Lumen. The disabled case made no catalog
request before confirmation and preserved the title filter when
switching to HD. Bundled screenshots covered the recovery message
at 390 and 1440 CSS pixels.

Owned movie and series views now keep supported release-date and
original-title sorts on the local catalog. Eight standalone and
bundled browser checks covered a movie title search sorted A–Z,
a series bookmark sorted by first air date, and availability
bookmark recovery. These checks verified the API query with fixtures.

Release and first-air date filters also stay on the local catalog
for supported owned views. An indexed or Radarr item with only a year
can match a date range that overlaps that year. Full dates use inclusive
bounds. Three isolated server tests covered indexed movies, Radarr
inventory, and indexed 4K series. Four standalone and bundled browser
checks at 390 and 1440 CSS pixels verified that the series bookmark
passes its date filter and sort through to the local query.

Reversed discovery dates now stop the query. Lumen shows the existing
range validation message for a saved link with reversed dates, and
the server rejects reversed bounds before any lookup. Two server
checks and four fixture browser checks across standalone and bundled
Lumen covered valid and reversed date ranges.

Malformed bookmark dates also stop the query. The date controls
offer correction or a date-only reset that preserves the owned
filter. Four browser fixture checks at 390 and 1440 CSS pixels across
standalone and bundled Lumen confirmed that an invalid leap day
blocks requests until the dates are cleared. Matched visual review
remains open.

Search offers title and date sorting in both directions within each
result group on the current page. Classic bookmarks retain the sort
field and direction. Undated results follow dated results in either
direction. Two server route checks and four browser fixture checks
exercised Series result order, missing dates, and restoration of Best
Match. Other Classic sort fields, whole-result ordering, and matched
visual review remain open.

Movie and Series Search also offer highest- and lowest-rated order.
Classic rating-sort bookmarks retain their direction. The Series
fixture verified numeric ordering for fractional ratings in both
directions and displayed unrated results last. Two server routing
checks and four browser checks covered the selected sort and prior
title and date sorts.

Music Search sorts albums by their credited artists, and book and
audiobook Search sort by author. Classic bookmarks retain the
applicable order. Missing credits stay last. Two server routing
checks and twelve standalone and bundled browser checks covered
album and ebook credit order and the prior video sorts. Results are
ordered within the current page. Matched visual review remains open.

Book and audiobook Search also offer publisher order using the
publisher in catalog results. Classic publisher-sort bookmarks
retain the direction. Two routing checks and four standalone and
bundled browser checks covered bookmark routing and ebook publisher
order in both directions, with missing publishers last.

Movie and series title searches offer writer and director order.
Selecting either uses the existing scoped search response with
credits. Results without a credit stay last. Classic bookmark
direction is retained. Two routing tests and four browser fixture
checks covered credit ordering in standalone and bundled Lumen.
Discovery-filtered searches can also request credits for writer or
director ordering. Search and discovery share the same bounded
lookup queue. The server fixture verified that local discovery skips
TMDB by default and includes credits when requested. Eight browser
fixture checks across both deployments covered direct and filtered
searches. Whole-result ordering and matched visual review remain open.

Movies and Series title searches now page through the corresponding
provider catalog, matching Classic's scope. Collections are available
from All. Scoped searches skip credit lookups unless a credit sort is
selected. Server fixtures verified provider page counts, the credit
opt-out, and existing collection rules. Desktop and iPhone browser
fixtures verified sort readback on page two and a reset to page one
when changing scope.

All Search now advances book, audiobook, comic, and video catalogs
together. Pagination stays available through the longest reported
catalog. Catalogs that have ended no longer repeat earlier results,
and the Book Series preview appears on page one. Twelve fixture
checks across standalone and bundled Lumen covered mixed catalog
lengths, Back navigation, and the existing scoped pagination.

When one catalog request fails, All Search keeps successful results
visible and offers retry. Desktop and iPhone fixtures across both
deployments recovered from an ebook catalog 503 while retaining the
movie result. The combined search API now marks successful responses
as partial when a provider fails or times out. Lumen uses the same
Retry action for this response. The server fixture retained collection
results during a video provider failure. Desktop and iPhone fixtures
tested retry after a partial response in both deployments. Matched
visual review remains open.

Manual retry reuses a successful title response for the same
query, page, and account while retrying an independent catalog.
A partial title response is fetched again and the API sends it
with `Cache-Control: no-store`. Fixtures check both request paths
and prior results remaining visible.

Music now links to Collector Picks. Lumen reuses the music category gate
and shows recommendation reasons, trusted collector counts, matched
albums, and confirmed artist follows. The production build, two Express
tests, ten companion image tests, and 20 collector-related browser tests
passed. The new fixture covered the matched album and follow response on
desktop, iPhone 13, Pixel 7, and iPad Pro 11. Native cover artwork, live
federation, and matched visual comparison remain unverified.

Books and Audiobooks now link to Hardcover Book Recommendations.
Lumen opens feeds, applies author and series filters and ranking
feedback, resolves results to book details in the chosen format, and
creates personalized feeds through the existing Hardcover API. Legacy
bookmarks route to the page in the companion and under bundled frontend
lock. The build, two Express tests, ten companion image tests, and four
browser fixtures passed. Browser coverage includes opening a feed,
sending tuning feedback, and confirming creation on desktop, iPhone 13,
Pixel 7, and iPad Pro 11. The browser checks also verify resolving a book and opening the matched
audiobook detail in the selected format. Live Hardcover, artwork parity,
and matched visual acceptance remain unverified.

Household profiles now show the member name and independently gated
request and watchlist previews. Managed-user directory entries link to
the profile, and native member bookmarks resolve under bundled frontend
lock and in the companion. The production build, two Express tests, ten
companion tests, and eight browser checks passed. The browser tests
verify preview links and that an unprivileged viewer makes neither
private data request. Quota and playback activity panels, live providers,
and matched visual acceptance remain open.

Household profiles now show request limits to the member, administrators,
and delegated viewers who can manage both users and requests. The panel
reuses the Account quota cards. The production build and twelve browser
checks passed, including the case where request management alone cannot
read quota data. Matched visual acceptance and playback activity remain
open.

Plex household profiles now show total plays and links to recently
watched titles when viewed by the account owner or an administrator.
Playback responses bypass Lumen's browser cache. A missing Tautulli
integration leaves the panel hidden. The production build, 16 household
browser checks, and 14 cache tests passed. Live Tautulli responses,
playback artwork, and matched visual acceptance remain unverified.

The companion now opens first-run setup when SeerrNG reports that
initialization is pending. Bundled Lumen exposes the same flow at
`/lumen/setup`. It uses the existing Plex or Jellyfin/Emby sign-in
endpoints, checks the browser session before exposing administrator
controls, and reuses the media-library editor. Finish verifies an
enabled library and waits for the server to confirm initialization.
Four Jellyfin fixture checks and both deployment routing suites passed.
Live provider sign-in, advanced guided setup, and matched visual
acceptance remain open.

Setup now invalidates the short-lived public settings snapshot after
provider sign-in and passes the refreshed provider to the library
editor. The expanded fixture checks the actual Enable Library mutation
before finishing setup. It passed on four viewport presets against both
the standalone build and an embedded build mounted at `/lumen/`. The
browser fixtures stub provider responses.

First-run setup now includes an optional Media Categories panel for
instance availability and default user categories. It reuses the
administration forms and preserves drafts when collapsed. The production
build and four browser fixtures per deployment passed. The fixture verifies
saving a default category before initialization in both the standalone
build and the embedded build mounted at `/lumen/`. The two suites used
desktop, iPhone 13, Pixel 7, and iPad Pro 11 presets. Matched visual
acceptance and live settings writes remain unverified.

First-run setup can now open the existing Radarr, Sonarr, Lidarr, and
book service editors before initialization. Each editor loads on first
open and keeps its draft when collapsed. The production build and four
standalone browser checks passed, including opening Radarr and retaining
its unsaved draft. Live service testing and saving, bundled browser
coverage for this panel, and matched visual acceptance remain open.

The expanded setup fixture verifies testing a Radarr connection,
selecting its returned quality profile and root folder, and saving
the service before initialization. Four standalone and four bundled
browser checks passed. The service responses were stubbed.

First-run setup opens the download-client and Prowlarr editors on
demand. Both reuse the administrator forms. Four standalone and four
bundled browser fixtures verified that the panels open before
initialization. Saving live download-client or indexer settings and
matched visual acceptance remain unverified.

Household playback activity now uses the shared Lumen poster shelf
with validated TMDB artwork. The production build and 16 profile browser
fixtures passed. The administrator case verifies both the proxied
image address and the linked watched series. Live artwork and matched
visual comparison remain unverified.

Collector Picks now uses Lumen's shared square cover when a matched
album supplies artwork. The production build and all four collector
browser checks passed, including a proxied artwork fixture. Live
federation and matched visual acceptance remain unverified.

Book Recommendations now renders supplied Hardcover artwork through
the existing shared cover and image proxy. The cover uses the selected
book format's shape. The production build and four browser fixtures
passed, including the proxied cover and audiobook navigation. Live
Hardcover artwork and matched visual acceptance remain unverified.

Movie and Series genre directories now share Discover's backdrop tiles.
The directory keeps every genre from the filter catalog and remains
navigable when backdrop metadata fails. Images use the validated TMDB
proxy path. The production build and 16 browser checks passed, with
eight viewport-specific skips. The fixture verifies movie artwork and
Series navigation during an artwork outage. Live metadata and matched
visual acceptance remain unverified.

First-run browser fixtures now cover both Jellyfin and Emby server
identities, including HTTPS and a configured URL base. Eight checks
passed in each deployment. The fixtures verify the provider-specific
auth payload and completion with the shared library editor.

Plex first-run setup passed with fixtures at desktop, iPhone, Android,
and tablet viewports in each deployment. The checks covered the PIN popup
and credential exchange, server discovery, saving the connection, and
enabling a library before initialization. Live provider sign-in remains
unverified.

On initialized instances, administrators can reopen setup from
Administration and return without running initialization. Members opening
the guide URL are denied access. Twenty setup browser checks passed per
deployment across desktop, iPhone, Android, and tablet, including the
three first-run providers and both guide access levels. Baseline and
candidate visual comparison remains unverified.

Setup also opens the existing LazyLibrarian, Mylar, Kapowarr, BackIssue,
Sportarr, and Whisparr service editors on demand. Sixteen browser checks
covered administrator entry, service controls, and member denial across
both deployments and four viewport presets. Provider saves and matched
visual acceptance for these setup panels remain unverified.

The optional Lumen guide now opens one setup area at a time. Step links
preserve the selected area across reloads, and switching steps keeps
mounted editors available. Forty browser checks passed across both
deployments and four viewport presets. They include guide navigation,
reload, permission checks, and the three first-run provider fixtures.
Matched visual acceptance remains unverified.

The setup guide disables its navigation and completion controls while
download-client settings have unsaved changes. Saving or discarding the
draft restores navigation. Document unload also prompts while a draft is
dirty. Eight administrator browser checks passed after completing the
Prowlarr fixture. The other 32 setup cases passed on the same builds.
Matched visual acceptance and browser unload prompts remain unverified.

Guided setup now ends on a Review step showing the enabled media libraries
and which setup areas are optional. Finish revalidates library readiness
with the server before initializing. All forty setup browser cases passed
across both deployments and four viewport presets. The Plex case verifies
the saved library is shown in Review before initialization. Matched visual
acceptance remains unverified.

Setup Review now reads the saved download-client and Prowlarr settings.
It shows the enabled client count and whether a Prowlarr host and API key
are configured. Each read has independent error and retry handling.
Eight Plex setup fixtures passed across both deployments and four
viewport presets. Live integration health and matched visual acceptance
remain unverified.

Setup Review lists saved request-service names for each provider in the
setup editors. It reads each provider when its panel opens and handles
loading, empty, and error states independently. Forty setup browser cases
passed across both deployments and four viewport presets. Jellyfin and
Emby fixtures save a Radarr service and verify its name in Review before
initialization. Matched visual acceptance remains unverified.

Setup lists service editors for enabled media categories first and keeps
all existing editors available. Saving instance category changes updates
the ordering without discarding the mounted forms. Forty browser cases
passed across both deployments and four viewport presets. The reopened
guide fixture enables Music and checks that Lidarr moves up without a
page reload. Matched visual acceptance remains unverified.

The Request Services setup panel can narrow its existing editors by movies
and series, reading, music, or sports and adult categories. Returning to
all services restores the complete list. Sixteen guide browser checks
passed across both deployments and four viewport presets. Matched visual
acceptance remains unverified.

Download-client setup now offers Usenet, torrent, and combined profiles.
Each profile adds the appropriate default client and keeps saved and draft
clients available when switching profiles. Forty setup browser checks
passed across both deployments and four viewport presets. The guide
fixture adds a SABnzbd draft and verifies that switching to Torrents
preserves it. Live provider tests and matched visual acceptance remain
unverified.

Lumen now opens Book Series Requests from Requests and from the native
queue bookmark under frontend lock. The queue shows saved status and
monitors, and request managers can approve, decline, or stop according to
the current state. Sixteen browser checks covered manager approval and
member visibility across both deployments. The Express routing suite
passed. Catalog search and preview, exact links to catalog targets, live
service interactions, and matched visual acceptance remain open.

Book Series Requests now opens the exact Hardcover catalog preview from
each supported monitoring target. The preview preserves the server and
scope, distinguishes uncertain matches, and links confirmed books in
the catalog format. Sixteen browser checks and two Express routing tests
passed. Goodreads search, starting monitoring from a preview, bulk
requests, and matched visual acceptance remain open.

Hardcover previews now check monitoring support and let eligible users
request ongoing monitoring for the exact catalog identity, with optional
companion books. Sixteen fixture checks passed across both deployments,
including request permission and pending status. Live Chaptarr outcomes
and matched visual acceptance remain unverified.

Book Series Requests links to a series search with shareable title and
format filters. Search preserves distinct service variants and opens
backend library results through their numeric series API. The bundled
frontend lock preserves search parameters and numeric detail bookmarks.
Twenty-four browser checks passed across both deployments, plus two
Express routing tests. Live catalog search, bulk requests, and matched
visual acceptance remain unverified.

Series previews reuse the bulk book request dialog for confirmed matches.
The selection excludes ambiguous entries, deduplicates book identities,
and uses the preview's format and the matched edition metadata. The
existing author and series bulk flow remains format-selectable. Thirty-six
browser checks passed, including the exact audiobook edition payload and
the existing bibliography bulk flow. Live service delivery and matched
visual acceptance remain unverified.

Books and Audiobooks link to series search with the current format
selected. Goodreads monitoring entries link to a title search, and an
exact Goodreads target returned by a library series can start monitoring.
The request includes all linked books as required by the backend.
Twenty-four browser checks passed across both deployments and four
viewport presets. Live provider behavior and matched visual acceptance
remain unverified.

Series previews and backend library series details now offer a validated
management link to request managers when the API supplies a service URL.
They also link back to a search for the same series title and format.
Twenty-four browser checks passed across both deployments. Fixtures
covered management-link visibility and destination for managers and
members. Live service navigation and matched visual acceptance remain
unverified.

Series request actions now wait for server readback before re-enabling
the queue controls. Twenty-four browser checks passed across both
deployments, including decline, approval, stop, and a delayed readback.
Live provider effects and matched visual acceptance remain unverified.

Movie and series cast and crew bookmarks now open dedicated Lumen
credits pages. The title disclosures link to these pages, and the
pages reuse person cards and show the full list. Sixteen browser checks
passed across both deployments, along with two Express routing checks
and ten production-image proxy checks. Matched visual acceptance and
live metadata remain unverified.

GitHub code-scanning alert 693 flagged the ComicVine plain-text formatter
in the analysis of `ba2844e70`. In that revision and current main, its
only consumer renders each paragraph as a React text child. The alert was
dismissed as a false positive because the formatted value never reaches
an HTML parser. Alert 693 was dismissed as a false positive; alerts 654–657 covering the
shared artwork rendering paths were fixed separately.

Lumen's shared artwork validator limits same-origin image loads to the
image proxy and dedicated image endpoints. It retains query parameters
for those routes and preserves external HTTPS artwork support. The
request-cover fixture checks that an unrelated same-origin API URL falls
back to drawn artwork. Matched visual acceptance remains unverified.

Curated series and music collections now let Blocklist managers add the
eligible members after confirmation. The action uses each member's
existing TMDB or MusicBrainz identity, skips already blocked members, and
reports partial results. Sixteen standalone browser cases and eight
bundled Blocklist cases passed. Matched visual comparison remains
unverified.

Curated TV collections now offer a trailer from the first visible series
using the same validated YouTube destination as movie details. Forty-four
standalone browser cases and eight bundled collection cases passed,
including rejection of an invalid trailer ID before selecting the next
valid candidate. Live metadata and matched visual comparison remain
unverified.

TV details now show the same validated trailer control as movie details,
in the desktop action row and the narrow-layout detail controls. Forty
browser checks passed across standalone and bundled Lumen. The trailer
fixtures verify the valid YouTube destination and omission when metadata
contains only an invalid candidate. Matched visual comparison remains
unverified.

Movie, curated TV, and music collections now expose Collection
Associations through the existing per-title API. The panel loads on
expansion, excludes the collection's own members, keeps the strongest
relationship per related title, and allows relationship filtering.
Forty browser checks passed across standalone and bundled Lumen. The
curated fixtures verify deduplication and exact related-person links.
Live data and matched visual comparison remain unverified.

Administrators can add and remove curated TV and music collections on the
media server. Additions use only verified destinations and visible
members. Removals keep the server's verification token from the selected
library. Twenty standalone and four bundled browser cases passed. The TV
fixture verifies the narrowed add payload and the confirmed removal
token. Live media-server writes and matched visual acceptance remain
unverified.

Movie collections now provide administrator-only media-server collection
controls. Expanding the panel checks destinations on demand and uses the
shared collection confirmation sheet for adds and removals. Twenty
standalone and four bundled browser checks passed. The movie fixture
verifies on-demand loading, visible member IDs, and status readback.
Live provider writes and matched visual comparison remain unverified.

Media-server collection dialogs retain the write result if the following
library check fails. The page hides actions until it can verify the
destinations again. Forty standalone collection cases and four bundled
movie collection cases passed, including a failed post-write check,
retrying the read, and issuing only one write. Matched visual acceptance
remains unverified.

### Shared request-options failure localization (2026-11-24)

The shared movie, TV, and music request-options panel now localizes server-list
and selected-server detail failures. Its selected-server fallback names the
affected Servarr service; permission checks, server selection, and request
options are unchanged.

The selected-server 500 regression passes in English, French, and Arabic on
desktop, with no horizontal overflow. The pre-fix baseline displayed English
failure text in French and Arabic. Matched captures use 1440x900 pixels and
show the same panel geometry with translated error copy. Evidence is retained
at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-options-error-localization-20261124/`.
Live Servarr connectivity and the production Express `/lumen/` mount remain
unverified. The broader existing detail-options localization suite still has
six facts-visibility failures on desktop; those same assertions fail on the
pre-change baseline and are not covered by this fix.

Movie collections now offer Watch Trailer for the first visible member in
release order, using the same YouTube validation as title details.
Twenty standalone and four bundled collection checks passed. The fixture
verifies that an invalid trailer ID is skipped in favor of a valid one.
Live metadata and matched visual acceptance remain unverified.

### Bookmark and account workflow verification

| Workflow                                | Landed on main                                                  | Verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Still to verify                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Watch session links                     | `734054549`                                                     | Bundled default and locked routes preserve list, detail, and invite destinations. The redirect excludes query tokens and remains compatible with browser fragment inheritance.                                                                                                                                                                                                                                                                                                                                                                                                                               | A production bundled browser run verified the Classic redirect, local sign-in, and membership through the real API with CSRF and SQLite. OIDC and standalone invite acceptance were outside this run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Discovery and catalog bookmarks         | `59c94ea41`, `2cb2b54ef`, `544a8f00a`, `8e410df1f`              | Bundled redirect cases cover title details and discovery filters. Standalone browser cases cover availability filter selection, explicit quality precedence, and clearing legacy aliases.                                                                                                                                                                                                                                                                                                                                                                                                                    | Matched standalone and bundled discovery renders at narrow and wide viewports with the affected filters active.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Personal and administrator bookmarks    | `c057b5047`, `a58961631`, `0e8994380`                           | Bundled routing cases cover calendar, account, watchlist, search, settings, and dotted magazine titles. They also check Classic opt-in and unsupported settings fallthrough. At 390 and 1440 CSS pixels, the Classic scheduled-jobs bookmark passed real local sign-in, CSRF, and SQLite authorization in bundled Express and standalone nginx. Administrators reached Scheduled Jobs and received HTTP 200. Members landed on their account page and received HTTP 403 from the same endpoint.                                                                                                              | Other redirected administrator routes and job mutations. The isolated scheduler was idle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Request bookmarks and My Software       | `41b4302b7`, `709e83136`, `698c1568f`, `c6b2863f0`, `a8a136a1e` | Bundled routing, actual standalone nginx redirects, and standalone browser fixtures cover the requester, status, media, format and sort translations. My Software sends only the signed-in user's ID. Matched request renders were inspected at 390 and 1440 pixels. Standalone browser checks verify that a user request bookmark with conflicting requester parameters sends exactly the path user ID to the pending request endpoint.                                                                                                                                                                     | Bundled desktop and iPhone browser fixtures now start with the Classic status bookmark through production Express routing and verify that My Software sends the signed-in requester. An isolated SQLite route test verifies owner-only results for both implicit and explicit requester filters and rejects another requester with HTTP 403. An isolated bundled browser run at 390 and 1440 CSS pixels followed the Classic status bookmark through real local sign-in, production CSRF middleware, and the software request API with two SQLite rows. Both browsers saw only the signed-in requester’s row after sign-in and reload, and a direct request for the other owner received HTTP 403. A standalone run at the same widths used the current production build and nginx template in the existing Lumen test image. The companion proxied real sign-in, CSRF, and the isolated SQLite software API and passed the same owner-isolation and reload checks. |
| Coming Soon pagination and media filter | `6d9bf45a2`, `338876e79`                                        | Browser fixtures cover paging, retry, and title wrapping. Desktop and iPhone checks cover direct TV links, switching to movies, browser Back, and returning to both feeds. The first TV-only view fetches only the TV feed. Bundled and standalone redirect tests preserve the scope. At 390 and 1440 CSS pixels, both production deployments followed the Classic TV bookmark after real local sign-in, paged the real TV route, switched to Movies, and paged the real movie route. Only the selected feed was fetched, and the real routes passed page and date constraints to a synthetic TMDB provider. | Matched renders of the pagination controls and live TMDB responses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| One-time sign-in links                  | `ed08e9ee9`, `df8b19237`, `ae0cda171`                           | Standalone browser fixtures cover administrator creation and revocation, explicit redemption, address-bar cleanup, restoration of the requested title, and opening a link into an existing session. The real session and SQLite API tests verify expiry, revocation, single use, and conflict with an existing session. Expanded administrator controls and sign-in confirmation were visually compared with native SeerrNG at 1440px desktop and 390px phone widths; Lumen interaction cases pass on desktop and iPhone.                                                                                    | The visual comparison uses the same task and viewport widths, but the admin controls are intentionally located differently: native has a global Settings > Users selector, while Lumen exposes the same operations in each user row. Production PostgreSQL and external TLS termination were outside the SQLite/loopback browser run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

A follow-up on production builds from `d89e11007` verified four more
administration bookmarks after local sign-in against the real API, CSRF
middleware, and isolated SQLite accounts. Both the Express bundle and the
standalone nginx companion passed 16 cases at 390 and 1440 CSS pixels.
Administrators reached General Settings with the 4K or default quota
fragment, System Logs, and Administration with the TV and movies service
category selected in the URL. Members landed on their account page. The
corresponding settings, logs, and Sonarr configuration reads returned HTTP
200 for administrators and HTTP 403 for members. These were read-only
checks with synthetic accounts and no external providers.

Production builds from `99f606ee1` passed eight browser checks for Classic
book discovery bookmarks across bundled Express and standalone nginx at
390 and 1440 CSS pixels. After real local sign-in, the ebook bookmark
selected In Library and displayed the owned fixture. The other bookmark
switched to audiobooks, selected Not Yet, retained the narrator filter in
the discovery API request, and displayed only the unowned fixture. Both
catalogue and library responses were synthetic. Live book services were
outside this check.

Classic Trending bookmarks passed 12 browser checks on production builds
from `f1b9af9b1` across bundled Express and standalone nginx at 390 and
1440 CSS pixels. After real local sign-in, the ebook and audiobook
bookmarks selected the requested library scope and displayed the matching
fixture. The audiobook request retained its narrator. The Music request
retained FLAC, EP, and ascending release date, and the visible quality
and sort controls reflected those values. Catalogue, library, and Music
category availability used fixtures. Live providers were outside the check.

The older increment notes describe the state at delivery. Use the table above for
these workflows and current route, permission, and browser evidence when
rechecking the original inventory. A continuation audit must include both
deployments and a real authorization decision wherever a fixture stood in for
the server.

The one-time sign-in flow also passed against real SQLite users and the
SeerrNG session API using production Lumen builds at both base paths.
At 390 and 1440 pixels, each fresh browser opened a generated link to
the account page, kept the user signed out before confirmation, removed
the token from the address bar, and stayed on the requested account page
after redemption. A second redemption was rejected in each run. The
bundled build used the real Express Lumen mount. The companion build
used an isolated Express static mount, so this run does not verify nginx
forwarding or the production CSRF configuration.

A follow-up used SeerrNG's production CSRF middleware with loopback HTTP
cookies, the Express bundled mount, and the built standalone nginx
container. Fresh Chromium sessions at 390 and 1440 pixels redeemed a
generated link in each deployment. Subsequent redemption attempts passed
through the same deployment and were denied. The fixture used synthetic
users and exercised the real API, session validation, and SQLite storage.
An external TLS terminator and PostgreSQL were outside this run.

### Desktop regression and narrow Comics verification

The full desktop and iPhone browser suites on `2161e13a8` passed
661 and 638 cases, with nine and 32 skipped, respectively. Both used
the standalone production build and synthetic API fixtures. At 360 × 800, matched Comics landing screenshots showed that
the Publisher filter fit inside the content margin after the shared
filter change. The screenshot width fell from 361 to 360 pixels and
the pixel diff within the shared image bounds was confined to the
Publisher filter. The candidate also passed the Comics layout checks at
768 and 1280 pixels and the calendar and genre-picker interaction checks.
Live providers and the bundled deployment were outside this run.

GitHub reported zero open code-scanning alerts and zero open Dependabot
alerts at this checkpoint. The prior findings recorded above describe
their state at the time of that audit.

### Bundled browser regression checkpoint

The production bundle from `670b2bcb1` passed 40 desktop and iPhone
cases with the Express frontend mount serving `/lumen/`. Covered
workflows include setup, book-series search and requests, video
credits and trailers, collection blocklisting and media-server sync,
installed and native share handoffs, Track Requests, and proxy artwork
on request covers. The mount and static assets were real. Playwright
intercepted API responses, so live authorization and provider writes
remain outside this checkpoint.

### Server authorization checkpoint

On `f2040bfa5`, 331 Node route tests passed across requests, book
series, blocklists, and Track Requests. They exercised the server's
authorization and request handling with isolated fixtures, including
SQLite-backed requests and synthetic accounts. Coverage included
request ownership, delegated edits, book-series approval and
visibility, and permission revalidation before blocklist reads.
Collection playback and queue tests use Vitest. Both files passed all
41 cases under that runner after the Node runner rejected their Vitest
imports. These checks complement the browser fixtures. External
provider interactions still used test doubles.

### Household profile picture persistence

Lumen's desktop and iPhone browser fixtures exercised the local
account upload and subsequent profile read. The server integration
test used a synthetic local account and a generated PNG. It verified
that the account owner could upload the image, an administrator
could not upload for that account, and the returned versioned URL
served the stored 512 × 512 WebP. The storage directory belonged to
the test and the avatar was removed after verification. The browser
and server checks ran separately.

### Artist detail to Music discovery

The Artist page links directly to Music discovery with the artist name
and exact MusicBrainz ID. The separate discography action remains
available. Desktop and iPhone checks in both production deployments
verified that applying FLAC keeps the exact artist in the API request.
Matched baseline and candidate Artist renders at 390 and 1440 CSS
pixels showed the existing action row wrapping without horizontal
overflow. Tests used real local sign-in and synthetic artist and
discovery responses. Live music providers and the Classic in-place
artist picker workflow remain outside this check.

Music discovery now offers an in-place artist lookup. It identifies
same-name artists with MusicBrainz disambiguation, preserves the other
draft filters when selecting a result, and still accepts free text.
The bundled and standalone production builds each passed desktop and
iPhone checks after real local sign-in using fixture search responses.
The checks applied an exact artist with FLAC, then changed to free text
and verified that the stale artist ID was omitted. Idle screenshots were
pixel-identical to the baseline in both viewports. The populated picker
used the shared toolbar and select styling with no horizontal overflow.
Live MusicBrainz and native operating-system select menus were outside
this check.

A follow-up live MusicBrainz run on `1209b9646` passed after local
sign-in in bundled Express and standalone nginx at 1440 CSS pixels.
Searching for Phoenix showed distinct French indie band and Romanian
rock band options. Selecting the French band returned 20 live releases
on the first page in each deployment, all credited to the selected
MusicBrainz artist ID. MusicBrainz returned HTTP 503 on the initial
bundled lookup. The picker exposed Retry Artist Lookup and that retry
succeeded. The isolated configuration supplied a synthetic Lidarr
entry for category availability. No Lidarr library or quality lookup
was exercised.

The exact artist and FLAC filters also passed in both production
deployments at 1440 CSS pixels with real local sign-in. The isolated
SQLite library contained two FLAC rows with the same indexed artist
name. The live MusicBrainz release-group lookup selected only Too Young
for the French band Phoenix. The UI displayed the matching release and
the API returned one result. MusicBrainz returned HTTP 503 on the first
standalone run and responded successfully when the run was repeated.
The library rows were seeded, so this check did not exercise a Lidarr
scan.

Music discovery now applies the instance's available and blocklisted
title visibility rules. Explicit MP3 and FLAC library filters keep
available albums visible. As in Classic, the video-only hide-requested
setting leaves albums visible. Desktop and iPhone browser checks in
bundled Express and standalone nginx verified a hidden first page,
manual continuation to a visible album, and an explicit FLAC filter.
Matched renders retained the existing Music controls and used the
shared pagination button. Catalogue data was synthetic.

Configured Music genre and chart shelves on Discover now apply the
same visibility rules as Music discovery. Matched browser fixtures at
390 and 1440 CSS pixels verified that the normal album, shelf heading,
and See All link stayed in place while available and blocklisted albums
were removed. Genre and chart links kept their filters. This check
used the standalone production build and synthetic catalogue responses.
The bundled production build from `264e3e1ff` also passed both viewport
checks through the Express mount at `/lumen/`. Its See All links stayed
under the bundled base path and opened the same filtered Music results.
Browser fixtures supplied session, settings, and catalogue responses.

Configured video shelves on Discover now use the same visibility rules
as the built-in shelves. Saved-search shelves continue to show requested
matches. Standalone desktop and iPhone checks with fixture responses
verified hidden titles in keyword and streaming shelves, preserved
See All filters, and requested matches in saved-search shelves. Matched
renders showed the remaining cards and shelf controls in their existing
positions.

The bundled production build from `70716afd7` also passed the
configured video and saved-search shelf checks through Express at
`/lumen/` at 390 and 1440 CSS pixels. Browser fixtures verified keyword
and streaming visibility, retained a requested saved-search match,
and confirmed that title, collection, person, and See All links stayed
under the bundled base path. The backend session and metadata
responses were fixtures.

Bundled Coming Soon passed the wrong-page recovery check on
`49f2e8236` at 390 and 1440 CSS pixels. After real local sign-in, the
Express movie route received page 1 from a synthetic TMDB provider on
its first request for page 2. Lumen kept the first page visible and
offered Retry. Retry sent a fresh page 2 request and displayed its
title once. Live TMDB behavior was outside the check.

The Classic default quota bookmark also exercised real writes in the
bundled desktop and standalone iPhone production builds. Fresh settings
store empty quota objects. The baseline rendered a blank required field
and blocked a one-field save. Lumen now displays effective zeros for
unset fields and sends only the edited value. In each deployment the
administrator saved a movie limit, the value survived reload, and the
isolated settings file contained only the edited quota field. A member
with a valid CSRF token received the API's permission denial, and the
saved value stayed intact. Matched renders preserved the form geometry.

Per-user request quotas also passed the Classic user-settings bookmark
in bundled desktop and standalone iPhone Lumen. After local sign-in,
the administrator set a household member's movie limit to explicit zero
and the window to seven days. Both values survived reload. Clearing the
two fields restored inheritance, verified by nulls from the real user
settings API and blank controls after reload. The runs used isolated
SQLite users and the production session and CSRF middleware.

The bundled quota labels from `0b91da544` also passed at 390 and
1440 CSS pixels through the Classic user settings bookmark and real
local sign-in. The user settings API returned isolated instance quota
defaults for movies, books, and music. Lumen described them as
unlimited, one request across all time, and four requests per seven
days. The member's blank override remained distinct from each default.

The Scheduled Jobs bookmark also passed real administrative actions in
bundled desktop and standalone iPhone Lumen. After local sign-in, the
administrator ran and canceled an isolated scheduler job, disabled and
re-enabled its schedule, and saved a different cron expression. The
real settings routes invoked and canceled the fixture exactly once.
The enabled state and edited schedule were visible after reload and
present in the isolated settings files. Production jobs and provider
connections were outside the check.

Scheduled Jobs now shows when a running job cannot be canceled.
SeerrNG reports cancellation availability for local runs with handlers
and returns HTTP 409 for runs leased by another instance or jobs with
no cancellation handler. Standalone desktop and iPhone fixtures
verified the disabled action and retained controls for a cancellable
job. Matched renders reused the existing action row and button styling.
Two API regression checks verified the unavailable cases.

Bundled Scheduled Jobs passed cancellation availability at 390 and
1440 CSS pixels on `55a97688c`. After real local sign-in through the
Classic bookmark, Express reported one running fixture without a
handler and one locally cancellable fixture. Lumen disabled the first
action. Running and canceling the second fixture through the real API
returned it to Idle. No production jobs or provider connections were
used.

On `32b2b6797`, the Classic Scheduled Jobs bookmark passed disabled
schedule editing in bundled desktop and standalone iPhone Lumen.
The isolated job stayed disabled without a next invocation after the
administrator saved a cron change and reloaded. Enabling the job then
registered its next invocation with the edited schedule. Both runs
used real sign-in and settings routes with an isolated scheduler job.

Job enable failure recovery on `26f188344` passed through the Classic
Scheduled Jobs bookmark in bundled desktop and standalone iPhone
Lumen. The real API rejected an invalid cron expression with HTTP 400
and the job stayed disabled and unscheduled. After correcting the cron,
an injected settings write failure returned HTTP 500 and left the job
disabled, with the corrected expression intact. The next enable
succeeded and registered an invocation. Both runs used isolated
scheduler jobs and real local sign-in.

System Logs bookmarks on `3040909f4` passed real log reads in bundled
desktop and standalone iPhone Lumen. Both followed a Classic page-two
bookmark through local sign-in, sent offset 25 to the protected logs
route, and showed the second page from 60 synthetic entries written
to the isolated machine log. Reload kept page two. Searching returned
to page one and did not put the search term in the address.

Matched standalone System Logs renders compared the parent of
`3040909f4` with the updated page at 390 and 1440 CSS pixels. Both
builds displayed the same fixture result and page-two controls after
Next Page. The screenshots were pixel-identical at both widths.

System Logs display preferences on `e2f11af24` also passed at 390 and
1440 CSS pixels through the bundled Express mount. After real local
sign-in and reading the isolated machine log, the browser restored
Warnings and Errors and 50 rows on reload. The first request after
reload used both preferences without the previous search term. The
stored preference object contained only severity and page size.

Bundled System Logs on `bc5b6b4e4` kept the same log entry expanded at
390 and 1440 CSS pixels through the Classic bookmark and real local
sign-in. Both runs appended a synthetic log with the same timestamp
and different details to the isolated machine log. Refresh used the
real logs endpoint. The original details remained open and the new
entry stayed collapsed.

The ten-row System Logs setting on `cfb8f0ba8` passed bundled desktop
and iPhone checks with real sign-in and synthetic machine logs. The
browser requested ten rows on page one. Opening the Classic page-two
bookmark in the same browser retained the preference, sent offset ten
to the real API, and displayed ten rows from page two.

Administration search passed matched standalone production renders on
desktop and iPhone. The new search field and result list preserve the
existing category links and settings rows. Browser regressions at both
viewports verified search across categories, an empty result, and direct
links to the application API key and 4K controls using browser API fixtures.
The bundled Express build of `7a46f151f` also passed desktop and iPhone
checks with real local sign-in and an isolated application API key.
Both search results scrolled the corresponding controls into view.

Administration search also opens Spotify Playlist Import and Steam Library
Import. The standalone build at 1440 and 390 CSS pixels retained a
pixel-identical unfiltered directory and showed both new results without
horizontal overflow. Browser fixtures confirmed that selecting each result
scrolls its credential control into view. Both destinations also passed
desktop and iPhone checks through bundled Express and standalone nginx
with real local sign-in and an isolated settings database. Live Spotify
and Steam setup remain unverified.

The Classic download-client refresh interval bookmark opened the actual
interval field after local sign-in in both the bundled Express app and
standalone nginx companion. Desktop and iPhone runs used the real settings
endpoint with an isolated instance and no download clients configured.
Matched renders retained the baseline form layout at both widths.

Administration search for download polling frequency opens the same interval
control. Desktop and iPhone checks covered the standalone production build
with fixture API responses and bundled Express with real local sign-in and
the isolated settings endpoint. The matched search renders showed the new
result at both widths without horizontal overflow.

Request Override Rules is reachable from Administration and its System
Services category. Bundled desktop and iPhone checks loaded a real isolated
Lidarr rule and displayed its service name, genre and root folder. The same
viewports confirmed a standard user was redirected and the API returned 403. Existing rules can be inspected. Creation, editing, deletion, empty and
error browser states still need a complete matched visual review; mutation
coverage through the companion is recorded below.

Bundled desktop and iPhone checks created, edited, reloaded, and deleted a
Lidarr request override rule through the real authenticated API and isolated
database. The original rule stayed present. The editor exposes the existing
service-specific condition and destination fields. The editor now resolves
condition values by name and covers all four provider types supported by the
native override-rule schema: Radarr, Sonarr, Lidarr, and Bookshelf/Readarr.
Other provider types are outside native behavior. Matched visual review remains
open.

The rule editor loads destination choices from the selected service and offers
named quality profiles, legacy Sonarr language profiles, root folders and
tags. Bundled desktop and iPhone checks supplied isolated Lidarr destination
responses, chose the named options, saved through the real override API,
and verified the same profile and tag on edit after reloading. Live provider
responses and matched native visual comparison remain open.

The override rule editor now resolves users, video genres, languages,
production countries and video keywords by name. Bundled desktop and iPhone
checks used local sign-in, the real user lookup and rule API, and fixture
metadata. Creating a Radarr rule persisted all five named conditions,
including two languages and two production countries in the API format.

Standalone nginx verification on `c0c326407` passed on desktop and iPhone.
Both viewports created a Radarr rule with named conditions, created, updated,
and deleted a Lidarr rule, and created and reloaded Sonarr and Bookshelf
rules. The Sonarr case saved the legacy language profile and the Bookshelf
case retained its text genre. The tests proxied real sign-in and rule
mutations to an isolated Express server. Provider choice and metadata
responses were fixtures. The regular browser suite checks the payload for
multiple language and production-country selections in both standalone and
bundled production deployments, across desktop, iPhone, Android, and tablet.

The Classic `/settings/services#prowlarr` bookmark reaches Prowlarr Settings
after local sign-in in both production deployments. Browser checks covered
desktop and iPhone with real local authentication, plus the permanent
standalone regression for the preserved fragment. The change reuses the
existing Prowlarr screen.

The parity inventory previously listed automatic Blocklist rule setup as
unfinished. Lumen's administrator Discovery page already configures keyword
IDs, movie and TV genres, and the per-rule page limit; its browser regression
preserves stored genre selections and verifies changed-field persistence.
Movie, curated TV, and music collection actions are also implemented and have
browser coverage. The media identity tests cover all six server-supported
Blocklist types. The Issues and Blocklist browser matrix passes 60 cases in
standalone Lumen and 60 cases in the bundled `/lumen/` deployment across
desktop, iPhone, Android, and tablet. Mobile screenshots of the issue list,
issue detail, and Blocklist list were reviewed; the issue discussion test
scrolls the Add Comment action into view and verifies that it clears the fixed
mobile tabs. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-download-audit-20261122/issues-lumen/`
and `.../issues-bundled/`. A native SeerrNG comparison could not be completed:
the isolated native `/issues` route returned its generic Oops page before the
fixture loaded. Evidence of that limitation is retained under
`.../native-baseline-blocked/issues/`; native visual parity remains unverified.

The Accounts inventory also overstated missing functionality. Lumen has TV
request access settings, per-user Episode Queue defaults, maturity limits, and
delegated user management. Focused browser fixtures passed 12 cases across
desktop, iPhone, Android, and tablet for Episode Queue persistence, clearing
one maturity limit without changing the other, and delegating only permissions
the manager holds. Remaining work is a full role and failed-save audit across
user settings, plus native-matched and bundled acceptance.

Indexer Search was present in the desktop sidebar but missing from the mobile
You menu. The You page now exposes it under Acquisition only when the signed-in
user has the same permission required by the desktop link. Focused Playwright
coverage passed 24 cases across desktop, iPhone, Android, and tablet, including
the authorized route handoff and the hidden state without permission. Matching
standalone production renders of `/me` at 1440 and 390 CSS pixels compared
baseline and candidate layouts; the new row uses the existing settings-list
owner with no horizontal overflow. Live Prowlarr handoff and bundled visual
acceptance remain open.

Coming Soon was available in desktop navigation but could be unreachable on
mobile when its Discover shelf was hidden or empty. The You page's Library
section now links to `/soon`; four browser cases per deployment verify the
entry, route, and no horizontal overflow across desktop, iPhone, Android, and
tablet.
Matching 390 × 844 CSS-pixel standalone captures before and after the addition
are retained in
`/mnt/disks/scratch/codex-task-scratch/seerrng-lumen-navigation-20261119/`.
The added row reuses the existing settings-list style; no native layout change
was needed.

Movie and Series Genre Directory routes now have direct browser coverage for
their loaded headings, genre tiles, and movie/TV filtered browse destinations.
The eight cases pass across four viewport projects in both standalone and
bundled Lumen. Broader filter and live catalog parity remain tracked above.

Indexer Search and Download Inbox suites now also run against bundled Lumen at
the Express `/lumen/` mount. The 36-case combined suite passed in both
standalone and bundled deployments across desktop, iPhone, Android, and tablet.
It covers the permission-gated mobile entry, direct-route denial, category
filtering, one-use handoff, Inbox visibility and denial, pagination, action
history, manual import, and rejection. Captures and isolated server logs are
retained under
`/mnt/disks/scratch/codex-task-scratch/seerrng-lumen-bundled-parity-20261119/`.
Live Prowlarr and download-client effects and native-matched visual acceptance
remain unverified.

### Viewer-scoped TV media-server saved items

TV details in Lumen now expose the existing viewer-scoped media-server saved
item action when Plex, Jellyfin, or Emby is configured. Plex uses the viewer's
Universal Watchlist; Jellyfin and Emby use the viewer's Favorites for the
selected quality. The action remains distinct from SeerrNG's local Watchlist,
uses the existing authenticated endpoint, and reads back state after writes.
Browser fixtures cover all three server types, add/remove, read-only retry,
unconfigured servers, and quality selection. Candidate and baseline were
rendered at `/tv/202` in the loaded Plex state and compared at desktop (1440 ×
1274), iPhone (1170 × 3495; baseline 3339), Android (1082 × 2922), and
tablet (1668 × 2416; baseline 2388).
The existing mobile detail action wraps onto its own row; surrounding detail
layout and sticky playback control remain intact. The unlinked-account state
was also rendered at all four presets; its recovery link wraps below the
unavailable action on iPhone, and browser checks confirm no horizontal
overflow. Live provider behavior and bundled acceptance remain open.

### Lumen regression checkpoint

The SeerrNG embedded Lumen asset was rebuilt from the current frontend before
the production-mount run; `public/lumen` is ignored build output and can become
stale unless `pnpm build:lumen` runs first. Against the freshly built asset,
352 browser cases covering account preferences, household profiles, book
grouping and requests, requests, acquisition, collections, details, and Swipe
passed across desktop, iPhone, Android, and tablet. Another 60 account,
managed-user, and override-rule cases passed through the same production
Express `/lumen/` mount. Watch Sessions and Setup added 20 cases each on both
deployments, bringing the selected current-source qualification set to 476
cases per deployment. Watchlist adds 36 cases on both deployments across user-scoped, personal, combined Plex, video/book identity, discovery filters, and pagination flows. Browser push adds eight cases per deployment for granted and denied registration permission across all four viewport projects. These fixture-backed runs qualify the bundled asset and
mount behavior; they do not replace live-provider checks or native visual
comparison.

Administration, compact-height navigation, and wide-display geometry added
45 passing cases and 15 expected skips per deployment. These checks cover
administrator entry and denial, mobile tab clearance, and Discover widths up
to 3840px. Calendar adds eight cases on both deployments, including month/filter URL state, administrator scope denial, partial/error/empty states and normalized movie, series and audiobook links. Coming Soon adds 14 passing cases and six expected viewport skips per deployment. Issues, Blocklist, and Download Inbox add 72 passing cases per deployment. Poster Watchlist adds 28 passing cases on both deployments. You-menu Coming Soon adds four cases per deployment. Movie and Series Genre Directory adds eight cases per deployment. Reader detail downloads add four cases per deployment across ebook/audiobook, comic and magazine formats. Optional Catalog Navigation adds four cases per deployment. Request Retry adds eight cases per deployment across request media types and owner/permission denials. Reader Issue Reports add four cases per deployment for book, comic, magazine and music detail controls. Game Library Navigation adds 12 standalone cases and eight bundled cases for globally and per-user disabled categories and enabled destinations. The selected current-source set now totals 731 standalone passing cases and 727 bundled passing cases, with 21 expected skips per deployment; native visual comparison and live effects remain
open.

The complete standalone Lumen browser suite passed at `11faf2052`: 2,892
passed, 108 configured skips, and 0 failures across 3,000 desktop, iPhone,
Android, and tablet cases. The run found two stale Watchlist test labels and
confirmed both passed after updating the selectors. Subsequent focused suites
on the saved-item and software-request-history increments passed 32 cases each
across the same four viewport presets. The standalone Lumen TypeScript/
production build passed after adding the unavailable-state validation. The
SeerrNG production build passed on the feature commit after synchronizing the
API message source catalog; that catalog commit also passed the i18n and
current-batch contract checks. The software-deck regression increment passed
on desktop, iPhone, Android, and tablet and the Lumen production build passed.
Exact latest-head hosted validation remains in progress; live provider
behavior, bundled/native visual comparisons, and the broader workflow gaps in
the inventory remain open.

### Security alert status (2026-11-19)

Live GitHub API checks report zero open Dependabot alerts, zero open code
scanning alerts, and zero open secret-scanning alerts for this repository.
CodeQL remains manually disabled under the owner directive. The seven
historical Lumen findings recorded below are now dispositioned: 654–657,
670–671, and 647 are fixed; 690 and 693 are dismissed as false positives with
their rationale recorded at the corresponding implementation notes. Both
`pnpm audit` and `pnpm audit --prod` report no known vulnerabilities. This
snapshot does not substitute for future scans after dependency or source
changes.

TV Request Settings now localizes the season-watch policy states, approval
review queue, Episode Queue controls, and account navigation using existing
SeerrNG locale messages, plus Lumen-specific labels for episode counts and
loading text. Browser fixtures pass in English and French across desktop,
iPhone, Android, and tablet. They verify viewer-only controls, manager review
access, queue-default persistence, and retaining a changed value after a
failed save so it can be retried. Matching baseline and French candidate
renders were compared at desktop and iPhone widths; only copy and natural text wrapping
changed, with no horizontal overflow. Arabic rendering, live provider
authorization, bundled-mount visuals, and the rest of the account role matrix
remain open.

Linked Accounts now localizes the route heading, navigation, sign-in methods,
media-server linking form, identity-provider actions, unlink confirmation, and
account-link feedback in English, French, and Arabic. The French fixture passes
across desktop, iPhone, Android, and tablet and checks desktop/iPhone baseline
and candidate renders plus horizontal overflow. The screenshot still shows
the now-localized Tracking Accounts section because its provider configuration
and authorization statuses share the same Discovery Accounts component.
Provider authorization, unlinking failure and role behavior, live readback,
Arabic rendering, and bundled-mount visuals remain open.

Tracking Accounts now localizes provider setup guidance, account states,
write-preference and disconnect actions, AniList/Trakt/Simkl authorization
flows, and their errors in English, French, and Arabic. French and Arabic
fixtures verify the translated empty state, provider actions, and server error
across desktop, iPhone, Android, and tablet, with no horizontal overflow.
Matching French desktop and iPhone baseline/candidate renders preserve the
existing control owners and layout; Arabic desktop and iPhone RTL candidates
were inspected. Live provider authorization, linked-account readback,
native-matched Arabic visuals, and bundled-mount acceptance remain open.
Evidence is retained under
`/mnt/disks/scratch/codex-task-scratch/seerrng-discovery-accounts-localization-visual-20261119/`.

Arabic Episode Queue copy on TV Request Settings now uses the locale's complete
plural selection. The previous implementation sent Arabic `two` and `few`
counts through the generic `other` message, so common values read incorrectly.
Browser fixtures verify the dual form at 2, the few form at 3, and singular at
1, alongside RTL direction, viewer-only controls, and no horizontal overflow.
The focused suite passes on desktop, iPhone, Android, and tablet. Matching
English and Arabic viewer-state baseline/candidate renders were inspected at
desktop and iPhone sizes; alignment, control geometry, surfaces, and navigation
remain intact. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-tv-settings-arabic-7626894f/`.
Live settings readback, provider authorization, bundled-mount visuals, and the
broader account role matrix remain open.

TV Request Settings now has explicit viewer, user-manager, request-manager,
and administrator permission coverage. Browser fixtures verify that user
managers and administrators alone see the access-review queue and account
Episode Queue editor, while request managers and administrators bypass the
per-account season-watch gate and viewers and user managers retain its request
action. All four role combinations pass on desktop, iPhone, Android, and tablet.
The remaining account routes still need their own complete role matrix.

The user-manager dropdown's episode-count labels now follow the selected locale
instead of always using English. Browser checks cover every 1–5 option in
Arabic and French; English remains the baseline. Candidate renders of the same
manager state were inspected against the retained English desktop and iPhone
baseline screenshots, including the selected value, RTL page direction, and
overflow. The native select's expanded menu is OS-rendered, so its platform
menu presentation is excluded from screenshot acceptance; its option text is
verified through the browser DOM. Live settings readback and bundled-mount
visuals remain open.

### Keep the open genre popover anchored after selection

The tablet workflow exposed a stale horizontal offset: selecting a genre changes
the picker label width while the popover remains open. The popover now observes
its anchor and its own dimensions and recomputes its viewport-relative placement
after layout changes. The browser regression selects and removes genres at the
tablet viewport and asserts the open menu remains within the viewport. The
hosted failure trace showed the page scrolling horizontally with the menu at the
right edge; the previous candidate screenshot returned to the normal page width
with the menu in bounds. Local repeat validation passed 20 tablet runs with eight
workers, and the iPhone recommendation-feed case passed. Exact-head hosted
qualification remains required before release.

### Localized Live TV Recordings page

The configured desktop Recordings link and destination now use the saved
SeerrNG locale catalog. The route localizes headings, statuses, actions,
filters, dates, error and empty states, and Followed Teams. Browser checks
verified populated English, French, and Arabic fixture states; Arabic sets RTL
direction. Six desktop recording workflow and locale cases passed. The full
page renders at 1440 × 900 were inspected; the existing shared layout and
controls remain in use, and all three locales fit the viewport. Evidence is
retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-validation-44600171238/recordings-fullpage-candidate/`.

Follow-up validation found that the populated page was localized but its list
loading message and Live TV status failure title still fell back to English.
Both messages now use the locale catalog in English, French, and Arabic; the
existing recording-list error translation is used for list failures. Browser
coverage holds the recordings response to verify loading copy, checks both
status and list failures in all three locales, and retains manager approval,
member cancellation, and unconfigured-service cases. Nine desktop cases pass.
Populated English, French, and Arabic captures at 1440 × 900 are pixel-identical
to the previous reviewed captures. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-recordings-recovery-20261122/`.

### General application settings localization

The Application panel on `/admin/general` now follows the signed-in Lumen
locale for its title, interface and availability choices, login controls,
help text, validation, loading state, and save feedback in English, French,
and Arabic. Existing interface routing and sign-in safeguards remain the
same. The load-error formatter is stable across renders so `useApi` does not
re-fetch settings on every render. Browser fixtures cover failed-save
retention and retry, the changed-field payload, locale direction, and overflow
at desktop, iPhone, Android, and tablet sizes. French desktop and Arabic phone
captures were compared with the English baseline; existing panel geometry is
retained. Other locales use English fallback. This change covers only the
Application panel; instance request policy, quotas, and permissions still need
their own localization and workflow parity review. Live settings save/readback against SeerrNG and independent
linguistic review remain open. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-general-localization-20261121/`.

The Spotify credentials panel on `/admin/general` now localizes its heading,
credential fields, setup guidance, saved-secret hint, removal control, and save
feedback in English, French, and Arabic. Existing behavior still keeps the
secret write-only after saving and submits only changed values. The browser
fixture verifies the localized controls and the exact client ID/secret payload
across desktop, iPhone, Android, and tablet. French desktop and Arabic phone
candidate renders show the added guidance inside the existing field rows;
Arabic shows the same fixed navigation overlap present in the English baseline.
Live Spotify authorization and credential readback remain unverified, and the
upstream Arabic Spotify labels have not had independent linguistic review.

The Download Copies panel now localizes its path-mapping editor, setup guidance,
JSON validation, save feedback, and section title in English, French, and Arabic.
It retains the 100-entry bound, exact mapping payload, read-only-root guidance,
and only reports success after the API confirms the saved list. Browser fixtures
verify valid save and malformed JSON rejection without an API write across
desktop, iPhone, Android, and tablet; all 12 locale/viewport cases pass with no
horizontal overflow. The French mobile save label was shortened after the first
comparison exposed a 39-pixel overflow. English baseline and English/French/Arabic
candidate captures at 1440, 834, 412, and 390 CSS pixels were inspected; existing
field ownership and panel geometry are retained. Arabic still has the shared fixed
navigation overlap visible in the English baseline. Live filesystem mapping and
file-download behavior remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-general-localization-20261121/`.

Instance Request Settings now localizes its policy choices, descriptions, loading
state, save action, and save feedback in English, French, and Arabic. It retains
the existing `/settings/public` read and `/settings/main` write contract. Browser
fixtures verify the changed-flag payload and confirmed save across desktop,
iPhone, Android, and tablet. Live server persistence and independent linguistic
review remain open.

### Track Requests localization

The Track Requests route now follows the saved English, French, or Arabic
locale for queue scope and status filters, lifecycle labels, pagination,
requester and search counts, and manager approval/cancellation confirmation.
Authorization checks and the existing GET, POST, and DELETE request behavior
are unchanged.

Twelve saved-locale cases pass across desktop, iPhone, Android, and tablet,
including scoped queue loading and the confirmed cancellation route. The
existing manager approval/cancellation and history pagination workflows also
pass across all four viewports. The production build and i18n check pass.
English baseline/candidate phone captures match pixel-for-pixel; desktop
geometry matches with only small text antialias differences. French desktop
and Arabic phone captures were inspected for wrapping, RTL, and overflow.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/track-requests-visual/`.
Bundled Express mount, live Soulseek actions, and independent linguistic review
remain open.

Book Series Catalog and Requests now use the same saved locale for catalog
loading and matching states, ongoing monitoring controls, request status, and
manager actions. Request authorization, monitoring endpoints, catalog identity,
and persistence are unchanged. Twelve saved-locale cases and the existing
manager/member queue and catalog-navigation tests pass across four viewports
(36 cases). English baseline and candidate captures match at 1440 × 900 and
390 × 844; French desktop and Arabic phone captures were inspected for wrapping,
RTL, and overflow. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/book-series-admin-visual/`.
Bundled Express mount, live provider behavior, and independent linguistic
review remain open.

The Application API Key panel now localizes reveal/hide, copy, regeneration,
confirmation, and feedback in English, French, and Arabic. Existing key
replacement behavior and immediate invalidation are preserved. Browser fixtures
cover reveal, cancel, regeneration, and the masked replacement state at desktop,
iPhone, Android, and tablet sizes. Clipboard permission and live integration
rotation remain unverified.

Default Request Quotas now localizes its guidance, category choices, fields,
links, save action, and feedback in English, French, and Arabic. The existing
partial update payload, 10,000 limit, and save confirmation remain intact.
Browser fixtures verify an exact movie quota update across desktop, iPhone,
Android, and tablet, and the screenshots were checked for overflow. Live quota
persistence remains unverified.

Default User Permissions now localizes its heading, guidance, administrator
warning, edit action, confirmation, and save feedback in English, French, and
Arabic. Permission names use SeerrNG’s French and Arabic catalog entries along
with the existing Lumen translations for app-specific permissions. The browser
fixture verifies that a default permission is removed only after confirmation
and that the exact bitmask is saved across desktop, iPhone, Android, and tablet.
The French desktop
and Arabic phone captures were checked; Arabic retains the existing fixed
navigation overlap seen in the baseline. Live permission persistence remains
unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-general-localization-20261121/`.

The Administration search now includes direct shortcuts to Default User
Permissions and Default User Categories. English, French, and Arabic browser
fixtures verify the localized search results, destinations, and automatically
expanded permissions editor across desktop, iPhone, Android, and tablet; all
twelve locale and viewport cases passed. Search-result captures are retained
alongside the General Settings evidence.

Administration search also opens the Outbound Proxy password field directly.
The field is an explicit fragment target, displays no saved secret, and retains
the existing blank-means-keep behavior. Its browser fixture verifies the exact
destination, visible field, and safety hint across desktop, iPhone, Android,
and tablet. The full-page captures are retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-general-localization-20261121/admin-menu-candidate/`.

Optional media routes wait for public and signed-in account category settings
before mounting page components. When the per-user setting disables a category,
the existing category notice appears without starting catalog or detail
requests. Fixtures turn categories on globally and off for the user, then open
22 direct routes across music, comics, magazines, games, sports and adult media;
none issues a category data request. All four viewport projects pass. SeerrNG
continues to enforce category permissions on every API request.

The same pre-mount category boundary now covers core Movies, Series, Ebooks,
and Audiobooks browse and detail routes, including author and book-series
search/catalog/request workflows plus the selected format for book details and
recommendations. The primary desktop and phone navigation also
omits categories disabled either globally or for the signed-in account. The
browser fixture visits 18 direct routes with the categories disabled and
checks that no catalog requests run; all four viewport projects are required for
acceptance. Mixed-media routes such as Discover and global Search retain their
cross-category results and filters rather than being hidden wholesale.
Discover now applies those same per-account categories to its shortcut chips,
movie/series/book shelves, genre and upcoming rows, and recent-media detail
lookups. When both movie and TV are off, the combined trending and recent rows
do not query their catalogs. The same fixture verifies that disabled-category
Discover performs no category catalog or detail requests. French and Arabic
disabled notices pass across all four viewport projects with RTL and overflow
checks; screenshots and test results are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-general-localization-20261121/core-category-routes/`.
Search scope chips and browse shortcuts also follow the signed-in category
settings. Direct links carrying a disabled movie or book scope show the
localized category notice and make no title-search or catalog request; mixed
trending results are filtered to the categories the user can access. The
Search regression passes on desktop, iPhone, Android, and tablet, with evidence
at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-general-localization-20261121/search-category-routes/`.
Trending and person-detail destinations also wait for enabled movie or series
categories before loading. The all-off fixture now visits both destinations,
checks the category notice, and confirms no trending or person metadata request
is sent across all four browser viewport projects. The complete admin-options
browser file passes with 383 cases passed and one existing skip on the same viewport
matrix. Both standalone Lumen and packaged `/lumen/` production builds succeed.
TMDB lists, movie/series association graphs, and TV franchises now use the same
pre-mount category boundary; list cards also omit any disabled media type when
only one of Movies or Series is enabled. Their direct routes are included in
the all-off no-query fixture. Association results also omit disabled movie or
series edges while retaining allowed edges; a mixed-result fixture verifies
this when only Movies is enabled across all four viewport projects. The focused
association test passes 4/4. Person filmography similarly hides disabled media
types, and the movie bulk-request shortcut follows the account category switch;
the focused person test passes 4/4. The bundled `/lumen/` production build
succeeds. The movie-only Coming Soon page also waits for Movies to be enabled;
the all-off route fixture covers its no-query behavior. Calendar removes disabled
media filters, skips a direct disabled-category query, and filters mixed API
responses by account categories. The direct-scope and mixed-results tests each
pass on all four viewport projects; desktop enabled/disabled captures were
reviewed at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-general-localization-20261121/calendar-visual/`.
Discover Watchlists now filter by server and signed-in account categories and
omit disabled media filter options. Personal Watchlists retain saved items
when a category is disabled globally while still honoring explicit per-account
category restrictions. Delegated Watchlists show the target-scoped API results
without filtering them with the viewer's settings. The regression
passes on all four viewports; desktop enabled and disabled captures were
reviewed at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-general-localization-20261121/watchlist-category-visual-rerun/`.
My Media now hides movie or series library items disabled for the signed-in
account, omits disabled tracking filters, and waits for category settings before
requesting library pages. The four-viewport regression passes; desktop captures
are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-general-localization-20261121/library-category-visual/`.

Delegated Watchlists also load without waiting on the viewer's media-category
probes. A new regression confirmed that a target movie previously disappeared
for an authorized manager whose own Movies category was disabled; the target
item now renders and the type filter remains available. The full
Watchlist browser suite passes 40/40 across desktop, iPhone, Android, and tablet;
the per-account category regression passes 4/4. Both suites also pass against
the production Express `/lumen/` mount. Matched baseline/candidate renders at
those viewports show unchanged layout, with the previously missing row visible
in the candidate. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-general-localization-20261121/delegated-watchlist-categories/`.

My Media now uses the SeerrNG locale catalog for its library filters, provider
states, identity matching, and private-pack controls, and Lumen's English,
French, and Arabic translations for its added scan and tracking workflows.
Connected-account recovery headings and malformed-response messages are also
localized. The browser suite passes 44/44 across desktop, iPhone, Android, and
tablet; the locale and recovery assertions also pass 8/8 each for French and
Arabic. Baseline and candidate renders were compared at desktop and phone sizes
for French and Arabic; layout geometry and horizontal fit remain stable. The
screenshots and Playwright results are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-general-localization-20261121/my-media-localized/`.
The rebuilt embedded bundle also passes all 44 My Media and localization cases
on an isolated Express static `/lumen/` mount, with fixture API responses. The
matching `/lumen/` route helper and API-prefix parsing were added to both
browser specs. The HTML and hashed assets served from `public/lumen` were the
fresh build from current Lumen source. Results are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-general-localization-20261121/my-media-bundled-final-results/`.
This does not exercise the full authenticated production server middleware or
live tracking-provider effects. Delegated library-sharing behavior (if that
capability exists in native SeerrNG) and matched native visual acceptance also
remain open.

### Keep Lumen settings messages separate from native administration

The Lumen settings page now uses its own `lumen.adminSettings.*` message
namespace. The shared `lumen.admin.title` key remains the SeerrNG Administration
navigation title, so localizing Lumen settings cannot replace the heading in
the native administration directory. Regression coverage passes for the
standalone and bundled builds: 60 navigation cases per build and 12 settings
cases per build across English, French, and Arabic and desktop, iPhone, Android,
and tablet viewports. The lock label now uses the isolated settings namespace,
and the read-only JSON preview declares left-to-right direction in Arabic. French
desktop and Arabic iPhone captures were inspected; the Arabic preview punctuation
now renders in code order. Matching English baseline/candidate captures for You,
Discover, Administration, and Lumen Settings are pixel-identical at desktop and
iPhone sizes. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-navigation-audit-20261121/`.

### Qualify account workflows at the bundled mount

The saved-locale account test now brings the mobile tab bar back into view before
checking its localized links; the bar correctly yields while a long settings form
is scrolled. Client Tokens, Linked Accounts, and personal Notifications browser
fixtures now prepend the `/lumen/` mount and normalize mounted API paths, so the
same tests exercise the packaged frontend instead of accidentally opening
unmounted root routes. The combined profile, locale, linked-account, token, and
notification suite passes all 88 cases on both standalone and bundled builds
across desktop, iPhone, Android, and tablet projects. All writes are fixture
responses; real account persistence and provider mutations remain separately
unverified.

### Household profile localization and request limits

Household Profile now follows the saved account locale for profile actions,
joined date, recent requests, watchlist, playback activity, profile-picture
validation and upload feedback, empty states, malformed responses, and retry
controls. Request Limits now localizes its category labels, remaining-count
text, period, loading state, and error recovery when used on household or other
account pages. Existing profile visibility checks, quota/request/watchlist
API calls, and avatar upload behavior are unchanged.

The household-profile role/retry suite and the new English, French, and Arabic
localization cases pass 44/44 in both standalone Vite and the production-style
Express `/lumen/` mount across desktop, iPhone, Android, and tablet. Matching
English baseline/candidate renders are pixel-identical at desktop and have the
same responsive geometry at iPhone size. French desktop and Arabic iPhone were
inspected; no horizontal overflow was detected at the four tested viewports.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-household-profile-20261121/`.
Live authorization, quota persistence, and independent translation review remain
unverified.

### TV episode-request sheet localization

The TV detail action and episode-request sheet now follow the saved account
locale for the dialog name, heading, season label, season names, load/empty
states, retry, eligibility note, submit/approval/loading actions, and close
control. Season and episode selection, availability filtering, request payload,
authorization, and provider behavior are unchanged.

The browser flow covers metadata failure and retry, an already-available
episode, a selected missing episode, and the exact TV request payload for
English, French, and Arabic. All 76 TV request state/localization cases pass
across desktop, iPhone, Android, and tablet in both standalone Lumen and the
production Express `/lumen/` mount. English desktop baseline and candidate
screenshots were inspected in the failed-load and selected-episode states;
layout and control geometry are unchanged. Evidence is retained
at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-tv-request-sheet-20261121/`.
Live metadata/provider behavior and independent translation review remain
unverified.

### Playlist import localization

The Spotify and YouTube playlist import page now localizes its connection,
preview, matching, request-selection, and recovery copy in English, French, and
Arabic. The locale affects display only: OAuth callback URL, playlist resolver,
matched-album and unmatched-track request payloads, and permission checks are
unchanged. Browser coverage exercises the Spotify callback and disconnect
round-trip at desktop, iPhone, Android, and tablet sizes for each supported
locale. The preview/selection/retry flow now runs in English, French, and Arabic
at desktop, iPhone, Android, and tablet sizes. It verifies localized
matched/unmatched states and failure recovery, retries only the failed track,
and asserts the unchanged matched-album and unmatched-track request payloads.
The Spotify callback/disconnect flow and preview/selection/retry flow pass 24
cases each across standalone and embedded production builds (48 cases total),
including the embedded OAuth callback destination. Preview and failure-state
visual evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-playlist-localization-20261121/`;
the states were inspected at desktop and iPhone sizes in all three locales.
Geometry was compared against the pre-fix baseline at matching desktop and
iPhone viewports; the Arabic URL label no longer overlaps the URL field. Live
Spotify authorization and playlist provider behavior remain unverified.

### Associations route localization

The standalone Associations route now follows the saved account language for
its title, navigation, relationship filters, graph controls and accessibility
labels, loading and empty states, and collection association disclosure and
partial-load retry. Server-provided reason identifiers and values are rendered
through the matching locale message; unknown reason identifiers retain the
server-provided explanation. API requests, relationship filtering, exact media
identities, and graph selection behavior are unchanged.

The route localization and collection retry cases pass in English, French, and
Arabic at desktop, iPhone, Android, and tablet sizes in both standalone and
production-style embedded builds (24 cases per build). Existing movie, music,
and book association flows also pass in both builds. French desktop list and
graph states and the Arabic iPhone list state were inspected; matching baseline
and candidate captures show no layout or geometry changes. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/`.
Live association-provider responses and independent translation review remain
unverified.

### Admin Users localization

The Lumen Admin Users directory and managed-user editor now use the saved
English, French, or Arabic locale for the Administration and All Users route
links, search controls, Manage accessible name, management-section controls,
panel titles, and notification-loading state. This closes a prominent display
gap without changing user routes, API calls, or existing authorization checks.

The localized directory, create-user and media-server import forms, and
management actions were exercised in all three locales at desktop, iPhone,
Android, and tablet sizes in standalone and production-style embedded builds
(24 cases per deployment). English baseline/candidate screenshots are pixel
identical for the directory, create form, import, and opened management panels
at desktop and iPhone sizes; French and Arabic renders were inspected at those
sizes, including Arabic RTL. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/adminusers-visual/`.
Independent linguistic review, provider-backed import verification, and the
remaining Administration destination pages are still open parity work.

### Audiobookshelf and Kavita settings localization

The shared Audiobookshelf and Kavita Administration connection form now follows
the saved account locale in English, French, and Arabic. This covers page and
section titles, connection fields, library selection and scan controls,
connection test/save/disconnect actions, and local loading, confirmation, and
recovery messages. The existing API paths, credential handling, library
selection requirements, and provider authorization behavior are unchanged.

The Audiobookshelf test, library selection, save payload, and disconnect flow,
plus the Kavita test/save/disconnect lifecycle, pass in all three locales across
desktop, iPhone, Android, and tablet in both standalone and production-style
`/lumen/` builds (48 cases). English baseline
and candidate captures were compared at matching desktop and iPhone viewports;
French desktop and Arabic iPhone renders were inspected for wrapping, overflow,
and RTL direction. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/admin-readers-baseline/`,
`.../admin-readers-candidate/`, and `.../admin-readers-embedded/`.
Live Audiobookshelf and Kavita server behavior and independent translation
review remain unverified.

### Download Client settings localization

The Lumen Download Client Administration page now localizes its page and
section headings, setup profiles, client fields, saved-credential controls,
connection-test status, add/remove/save/discard actions, and loading/save/test
feedback in English, French, and Arabic. The existing endpoints, masked
credential behavior, setup profile values, and provider operations are
unchanged.

The focused workflow passed across the three locales and four viewport presets
in both standalone and production-style /lumen/ deployments (24 cases per
deployment). It checks connection testing and saving while preserving the
existing credential, localized success feedback, and horizontal overflow.
English baseline and candidate screenshots match pixel-for-pixel at desktop
and iPhone sizes. French desktop and Arabic iPhone renders were inspected;
Arabic uses RTL layout without visible clipping. Setup-wizard embedding,
live client connectivity and persistence, and independent translation review
remain unverified. Evidence is retained at
/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/download-clients-candidate/.

### Share and Image Recognition settings localization

The administrator recognition workflow now localizes its page and section
titles, local OCR capability status, provider and model fields, saved-key
controls, uploaded-image consent, maximum image size, save/discard actions,
and loading/success/failure feedback in English, French, and Arabic. Provider
choices, credential redaction, consent reset when the destination changes,
and the requirement for explicit external-image consent are preserved.

The focused workflow verifies localized labels and RTL direction, retains edits
after consent rejection, confirms that changing the provider URL resets
consent, saves without resending the stored API key, removes a saved key, and
discards changes. All 24 browser cases pass in standalone and all 24 pass in the
production-style `/lumen/` mount across desktop, iPhone, Android, and tablet.
English desktop and iPhone screenshots match the previous build pixel for
pixel. French desktop and Arabic iPhone renders were inspected in both builds.
Live requests to Anthropic, an OpenAI-compatible server, Tesseract, and
independent linguistic review remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/recognition-browser-standalone/`,
`.../recognition-browser-embedded/`, and `.../recognition-visual/`.

### Navidrome and Jellystat settings localization

The shared Navidrome and Jellystat connection screen now follows the saved
locale for titles, URL and credential fields, Navidrome library-scan control,
test/save/disconnect actions, confirmations, and workflow status messages in
English, French, and Arabic. The provider-specific password/API-key fields,
masked-credential reuse, scan setting, and confirmed DELETE behavior remain
unchanged.

The browser suite verifies each provider's save, test using the masked saved
credential, cancel and confirm disconnect, and field reset. It passes 24 cases
in standalone Lumen and 24 in the bundled `/lumen/` mount over three locales and
four viewport presets. English baseline/candidate captures are pixel-identical
for both providers at desktop and iPhone sizes. French desktop and Arabic
iPhone renders were inspected in the bundled app. Live Navidrome/Jellystat
connections, provider persistence, and independent translation review remain
unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/url-connection-standalone-final/`,
`.../url-connection-embedded/`, and `.../url-connection-visual/`.

### Reader Delivery settings localization

The Lumen Reader Delivery screen now localizes Grimmory and BookOrbit connection
fields, delivery preferences, managed shelves, status, save/discard and
confirmation actions in English, French, and Arabic. Provider operations,
credential omission and redaction, shelf counts, and confirmed deletion remain
unchanged. Provider-returned shelf and Kobo error text remains provider-owned
and is shown verbatim.

The browser matrix verifies save failure draft retention, successful save
without resending saved credentials, explicit credential clearing, BookOrbit
grouping access, shelf counts, empty state, and cancel/confirm deletion. All 12
cases pass in standalone Lumen and all 12 pass under the bundled `/lumen/`
mount across three locales and four viewport presets. English baseline and
candidate screenshots have matching dimensions and geometry; RGB comparison
shows only expected text changes, including the saved-credential placeholder.
French desktop and Arabic iPhone renders were inspected. Live Grimmory and
BookOrbit services and independent translation review remain unverified.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/reader-delivery-standalone-final2/`,
`.../reader-delivery-embedded/`, and `.../reader-delivery-visual/`.

Screenshot comparisons use RGB channels. An earlier RGBA `getbbox()` check
could miss RGB differences when alpha stayed unchanged. Rechecking the
Download Clients and Share/Image Recognition captures in RGB confirms those
English captures are pixel-identical; the Reader Delivery captures correctly
show expected text-only changes.

### Media Server Libraries localization

The Media Server Libraries route now follows the saved locale in English,
French, and Arabic. This includes Plex/Jellyfin/Emby library controls, episode
ordering, audio-book classification, scan status and actions, Plex discovery,
Tautulli fields, and the shared media-server connection and saved-host controls.
Provider endpoints, permission gates, key redaction and reuse, saved-host
selection behavior, and scan polling/start/cancel behavior are unchanged.

The focused locale matrix passed 12 cases in standalone Lumen and 12 in the
production-style `/lumen/` mount across desktop, iPhone, Android, and tablet.
The existing media-library workflow suite passed all 36 cases across those
viewports, including denied access, Plex/Jellyfin/Emby library operations,
credential-preserving saves, Plex discovery, and Tautulli save/disconnect.
English baseline and candidate desktop/iPhone captures were visually reviewed
at matching states. French desktop and Arabic iPhone captures were inspected;
long-page full-screen captures show the existing fixed mobile navigation layer
over content while scrolling. No style or layout owners changed. Live media
servers and external translation review remain unverified.
Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/media-libraries-browser-standalone-final2/`,
`.../media-libraries-browser-embedded-final/`,
`.../media-libraries-visual/`, and `.../media-libraries-locales-saved-host/`.

A follow-up locale regression added a Plex book library to the route matrix and
found that its row subtitle still hardcoded “Audiobooks” despite the existing
translated label. The row now uses the shared English, French, or Arabic
message. Baseline and candidate French desktop and iPhone captures show only
the intended subtitle change; page geometry and the existing mobile navigation
overlay are unchanged. The full admin media-library suite passes 48 cases in
standalone Lumen across the four viewport projects, and the updated
localization matrix passes 12 cases in the production Express `/lumen/` mount.
Matching French desktop and iPhone captures were inspected in both deployments.
The label fits without changing row geometry or causing horizontal overflow.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-audiobook-label-20261122/`.

### Metadata provider administration localization

The Lumen Metadata Providers page and shared metadata credential form now
localize their headings, field labels, validation and provider status messages,
save/test actions, credential feedback, and Bookshelf catalog guidance in
English, French, and Arabic. Provider names, saved settings, credential
redaction, request payloads, and independent form behavior remain owned by the
existing integration components.

Browser fixtures verify the saved locale, translated provider fields and
section headings, RTL direction, and page overflow in English, French, and
Arabic across desktop, iPhone, Android, and tablet in the standalone production
build. The independent-save/provider-test fixture now normalizes API paths and
page URLs for the `/lumen/` base as well as the root base. All 12 browser cases
pass in each mode across desktop, iPhone, Android, and tablet. The `/lumen/`
run used a separately built production bundle with the correct base path served
by Vite preview; it does not establish the real Express mount or live API
behavior. Native-matched visual captures, actual provider round trips,
credential persistence, and independent linguistic review remain unverified;
this UI milestone is incomplete until those checks pass.
release-note: none

### Tunerr and Sportarr administration localization

The Lumen Tunerr settings and Sportarr integration panels now localize their
fields, save/test/connect actions, diagnostics, status values, and event/feed
counts in English, French, and Arabic. Configuration payloads, password
redaction, connectivity tests, authorization, and feed synchronization remain
unchanged.

The existing partial-connectivity, saved-password, and feed-link fixture plus
saved-locale fixtures pass on standalone production across desktop, iPhone,
Android, and tablet (12 cases). French desktop and Arabic iPhone candidate
screens were inspected; the existing fixed mobile navigation overlays a middle
portion of the tall form, and that pre-existing behavior remains. Screenshot
evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/tunerr-locale/`. Native-matched baseline comparison, bundled Express mount verification,
live Tunerr/Sportarr behavior, and independent linguistic review remain open.

### Software acquisition administration localization

The Lumen Software Acquisition route now localizes service connection controls,
emulation catalog selection and system grouping, IGDB platform matching,
Steam key management, and save/test feedback in English, French, and Arabic.
Provider names and catalog values remain domain identifiers. API payloads,
credential redaction, Saved Connection Host behavior, test endpoints, and
mapping persistence are unchanged.

The browser fixtures cover saved-locale headings/fields, RTL and overflow, plus
the existing saved-connection, API-key, catalog/system mapping, and failed-save
recovery workflow in English, French, and Arabic across desktop, iPhone,
Android, and tablet (12 cases). The Vite standalone build was used. A matched
pre-change visual comparison and bundled Express mount remain unverified, as do
live provider behavior and independent linguistic review.

### Request service administration localization

The Lumen Soulseek and ReadMeABook settings pages now localize their
connection forms, credential controls, test/save feedback, and provider feature
states in English, French, and Arabic. ReadMeABook's audiobook approval queue
and acquisition dashboard also localize their headings, empty/loading states,
approve/deny actions, and load recovery. Provider endpoints, secret omission,
settings persistence, and approval decisions are unchanged.

The existing provider fixtures and new saved-locale fixtures pass 24 browser
cases over desktop, iPhone, Android, and tablet. They cover stored-key tests,
explicit key removal, partial connectivity status, audiobook approval/denial,
dashboard data, French/Arabic labels, RTL, and overflow in the standalone
production frontend. French desktop and Arabic iPhone candidates were inspected;
the existing fixed mobile navigation covers part of the tall request-service
form and operations view. Captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/request-service-locale/`.
A matched native baseline, bundled Express mount, live provider round trips,
and independent linguistic review remain unverified.

### Request override rules administration

The override rules page now follows the saved English, French, or Arabic locale
for service names, rule summaries, condition lookups, editor labels, validation,
save/delete feedback, and recovery actions. Dropdown labels remain distinct from
their corresponding ID text-field labels. Rule matching, service selection,
condition values, and the `/overrideRule` payload are unchanged.

Saved-locale fixtures pass in all three locales across desktop, iPhone, Android,
and tablet (12 cases); the existing multi-language/country save flow also passes
in all four viewports and retains its expected API payload. French desktop and
Arabic iPhone candidates were inspected, including RTL and page overflow. A
matched pre-change/native visual comparison, bundled Express mount, live
provider behavior, and independent linguistic review remain open. Candidate
captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/override-rules/`.

### Bookshelf library migration localization

The Bookshelf library path migration page now localizes its source and
destination controls, author selection and paging, preview counts and disk
space, conflict/warning labels, confirmation, command progress, and recovery
messages in English, French, and Arabic. The supported service selection,
preview token, confirmation step, file move request body, and progress polling
remain unchanged.

The new saved-locale fixture passes in all three locales across desktop,
iPhone, Android, and tablet. The existing end-to-end preview test also passes
in all four viewports and confirms that conflicts prevent starting a move, a
changed destination invalidates the preview, and only the latest preview token
is sent after explicit confirmation. French desktop and Arabic iPhone candidates
were inspected. The sticky mobile navigation overlays part of this tall page in
the initial phone viewport; that shared layout behavior needs a matched baseline
review. Bundled Express mount, actual file moves, live provider state, and
independent linguistic review remain unverified. Captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/library-migration-french-desktop.png`
and `.../library-migration-arabic-phone.png`.

### Servarr service administration localization

Servarr service administration now localizes the shared connection form and
provider-specific choices, settings, diagnostics, save/test/remove feedback,
confirmation, service lists, and recoverable loading states in English, French,
and Arabic. Provider identifiers, credentials, profile and folder values,
service capability rules, and API request bodies remain unchanged.

Forty-eight browser cases pass across desktop, iPhone, Android, and tablet:
saved-locale Bookshelf administration plus existing Readarr/Bindery/BookOrbit,
Radarr, Sonarr, and collector save/test flows. French and Arabic use the saved
locale and Arabic sets RTL without page-level overflow. English baseline and
candidate screenshots match pixel-for-pixel on desktop; phone screenshots have
identical dimensions and 288 changed pixels around the sticky navigation.
French desktop and Arabic iPhone candidates were inspected. The shared mobile
navigation now yields while an editable control is focused and returns after
focus leaves when the page is near its top. This lets users reach lower form
controls that sit behind the fixed tabs while preserving the existing
scroll-direction behavior. The mobile navigation regression and short-screen
checks pass; matched focused-state screenshots at 390 × 844 are retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/navigation-focus/`.
Bundled Express mount, live provider operations, and independent linguistic
review remain unverified. Baseline and candidate captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/servarr-*-{desktop,phone}.png`.

### Watch Sessions localization

Lumen's Watch Sessions list, session creation and management, invitations,
join flow, ballots, and group matches now follow the saved English, French, or
Arabic locale. Arabic uses RTL. Session creation and management API payloads,
permissions, membership, and voting behavior remain unchanged.

The new saved-locale browser cases and existing watch-session creation,
membership, ballot, and confirmation workflows pass in all three locales and
four viewports (32 cases). The focused browser checks confirmed the unchanged
session-creation payload and no horizontal overflow. The production Vite build
and i18n catalog checks pass. Matched native baseline screenshots, bundled
Express mount, live multi-user provider behavior, fixed-navigation overlap on
tall mobile pages, and independent linguistic review remain open.

### Book Series Search localization

Lumen's Book Series Search route now follows the saved English, French, or
Arabic locale for its search controls, service availability and result states,
source labels, retry action, and result links. Query parameters and result
navigation remain unchanged.

Twelve saved-locale cases pass across desktop, iPhone, Android, and tablet; the
existing series search and manager/member request-queue tests also pass in all
four viewports (24 cases total). The production build and i18n check pass.
English baseline and candidate screenshots match pixel-for-pixel at 1440 × 900
and 390 × 844. French desktop and Arabic phone screenshots were inspected for
label wrapping, RTL, and overflow. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/book-series-baseline/`.
Bundled Express mount, live provider behavior, and independent linguistic
review remain open.

### Video credits localization

Movie and series credit routes now follow the saved English, French, or Arabic
locale for cast/crew headings, back and alternate-credit navigation, invalid
links, loading, retry context, and empty results. The existing detail API,
identity validation, and route behavior are unchanged. Twelve browser cases
passed across desktop, iPhone, Android, and tablet, including cast-to-crew
navigation, RTL direction, and horizontal overflow checks. Bundled Express
mount, live provider behavior, matched baseline comparison, and independent
linguistic review remain open.

### Related movie and series pages localization

Recommendation and similar-title pages follow the saved English, French, or
Arabic locale for page headings, return navigation, error context, and empty
results. URL state, viewer-filtered API reads, media identity, and pagination
remain unchanged. Twelve locale checks and the existing related-video paging,
identity, and retry test passed across desktop, iPhone, Android, and tablet
(16 cases). Bundled Express mount, live metadata, matched visual review, and
independent linguistic review remain open.

### Swipe History localization

The Swipe History panel follows the saved English, French, or Arabic locale
for category filters, decision labels, restore and clear actions, confirmations,
feedback, loading, errors, and empty states. It remains embedded in the Swipe
screen and keeps the established viewer-scoped GET, POST, and DELETE routes.
Twelve browser cases plus the existing restore/clear workflow passed across
desktop, iPhone, Android, and tablet (16 cases). Bundled Express mount, live
provider behavior, matched visual acceptance, and independent linguistic
review remain open.

### Collector Picks localization

Collector Picks follows the saved English, French, or Arabic locale for
availability, source counts, album links, follow actions, and user feedback.
Provider-supplied recommendation reasons and artist/album identities are
preserved. The existing authenticated artist-follow POST is unchanged.
Twelve locale cases and the existing follow integration test passed across
desktop, iPhone, Android, and tablet (16 cases). Bundled Express mount, live
federation, matched visual acceptance, and independent linguistic review
remain open.

### Provider Discovery localization

Lumen Provider Discovery follows the saved English, French, or Arabic locale for
feed selection, unmatched filtering and counts, MDBList entry, item match labels,
retry and reconnect actions, empty states, and pagination. Provider IDs, feed
keys, URL-backed filters, identity mapping controls, and provider requests are
unchanged. Twelve new locale cases and three existing feed filtering, retry /
reconnect, and feed-reset cases passed across desktop, iPhone, Android, and
tablet (24 cases). French desktop and Arabic phone candidates were inspected
for RTL, wrapping, and overflow. Live accounts, matched baseline comparison,
and independent linguistic review remain open. Captures are retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/provider-discovery/visual-test-results/`.

### Franchise relationship pages

Lumen Franchise pages now derive their media type from the fixed route segment
and load the matching TV or anime relationships. This also fixes the prior
invalid-title state on `/franchise/tv/:id` and `/franchise/anime/:id`. Page
headings, relationship groups and types, confidence, curator form, errors,
loading and empty states, and return navigation follow English, French, and
Arabic. The existing relationship authorization, endpoints, and mutation
payloads are unchanged.

Twelve locale cases passed across desktop, iPhone, Android, and tablet; the
existing server-authorized curator workflow also passes in all four viewports.
Overflow and locale direction are asserted, with French desktop and Arabic
iPhone captures retained. Pre-change captures at the same locale and viewport
showed that these routes only rendered an invalid-title error; therefore a
pixel-by-pixel state comparison is not meaningful. The candidate shows the
restored data view with no horizontal overflow. Live catalogue data and
independent language review remain unverified. Baseline and candidate evidence
is retained at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/franchise/`.

### Books and Audiobooks discovery localization

The Books and Audiobooks discovery page now follows the saved English, French,
or Arabic locale for format navigation, book-series and recommendation links,
landing notes, library and sort controls, genre choices, search filters, row
recovery, pagination, and empty or incomplete-library messages. Sort and genre
query values, book catalogue requests, ownership checks, and paging behavior
remain unchanged. The original English full-list heading terms (such as “New”
and “Top rated”) are preserved separately from the sort-menu labels.

Twelve locale cases and twelve existing library-row, list-return, and
filter-navigation regression cases pass across desktop, iPhone, Android, and
tablet (24 total); another twelve localized cases passed while capturing
French desktop and Arabic phone states. Production build and i18n checks pass.
Matched pre-change and candidate renders were inspected at 1440 CSS px and
390 CSS px; translated labels wrap within existing controls and the page has no
horizontal overflow. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-associations-20261121/books/`.
Live catalogue and library-provider behavior and independent language review
remain unverified.

### Book Detail localization

Book Detail now localizes format choices, narrator selection and status,
request and approval feedback, audiobook library actions, metadata labels,
empty and error messages, and the shared follow control's retry and following
states. The book IDs, edition selection, follow mutations, approval flow, and
request payloads are unchanged. Twelve English, French, and Arabic browser
cases pass across desktop, iPhone, Android, and tablet, including RTL and
overflow checks. Another 40 existing book request, ownership, and narrator
selection regression cases pass across the same viewports. French tablet and
Arabic desktop renders were inspected; the Arabic layout remains within the
viewport. Browser fixtures do not verify live catalogue or provider services,
and independent language review remains unverified. Screenshots and test
results are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-book-detail-localization-20261121/test-results/`.

### Book-series collection associations

Lumen's native SeerrNG association graph now also appears on book-series detail
pages. Expanding the existing collection-association disclosure checks the
series' member books through the authenticated book-association endpoint,
deduplicates and ranks related results through the shared owner, and links
eligible related books back to their detail pages. Empty series do not expose
the action. Existing identity validation and collection-association behavior
for movie, TV, and music collections remain unchanged.

The author/series workflow browser fixture verifies both member-book reads and
the related-book destination across desktop, iPhone, Android, and tablet. The
initial disclosure-closed page was compared at matching desktop and iPhone
viewports against the pre-change render; the novel expanded association state
was inspected in the candidate and remains content-dependent. The fixture does
not exercise a live association database or external provider. Evidence is
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-book-grouping-localization-20261122/`.

### Following actions localization

The shared Follow control now takes its default label from the saved locale.
Game story-expansion follows, anime future-volume follows, and audiobook
narrator follows also use the saved English, French, or Arabic locale. Follow
identity, selection, permissions, mutations, and server-confirmed state are
unchanged. The standalone and bundled `/lumen/` browser matrices each pass 20
cases across desktop, iPhone, Android, and tablet, including default labels,
narrator interpolation, game follow identity, future-volume follow identity,
retry, and confirmed server state. Matched baseline/candidate desktop and
iPhone captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-follow-actions-20261121/captures/`.
Live account locale behavior and independent language review remain unverified.

### Mobile navigation avoids expanded-panel actions

The shared fixed mobile tab bar now recalculates after a user-triggered content
resize. When an expanded panel places an action beneath the tab bar, the bar
yields until ordinary scrolling brings it back into view. Initial visibility,
focus handling, and scroll-direction behavior remain unchanged. The existing
admin-user localization flow passes on all four viewport projects with an
assertion that visible actions are not covered; the mobile-navigation suite
passes all six narrow-viewport cases with two expected desktop skips. At
390 × 844, the Arabic maturity-panel baseline showed the tab bar over lower
controls; the candidate keeps the same content geometry and hides the bar
while those controls are exposed. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-mobile-tabbar-20261121/`.

Shell navigation landmark names and pending-request badge labels now follow the
saved account locale. The primary navigation and tab names reuse SeerrNG's
translated `i18n.primaryNavigation` and `i18n.tabs` entries; request counts use
localized English, French, and Arabic labels. The focused browser check passes
in both standalone and production `/lumen/` deployments across desktop,
iPhone, Android, and tablet (24 cases). This changes accessibility labels only;
the navigation structure, visible copy, and layout are unchanged.

### Add catalog games to My Games

Signed-in users can add an eligible IGDB catalog game from its Lumen detail
page directly to their private My Games backlog, even when they cannot submit
software requests. Existing entries link to My Games, lookup and add failures
can be retried, and the action is omitted for DAT-only titles without an IGDB
identity. The feature uses the authenticated `/game-library/lookup` and
`POST /game-library` API, preserving request permissions and acquisition
behavior.

The browser suite passes 16 cases in standalone and 16 against the production
Express `/lumen/` mount across desktop, iPhone, Android, and tablet. It covers
no-request-permission users, existing entries, lookup/add retry, DAT exclusion,
payload identity, and navigation. Matching baseline/candidate desktop and
iPhone renders were inspected for both deployments; the added section follows
the existing page width and spacing. API/provider effects against a live
SeerrNG instance and native-matched visual comparison remain unverified.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-game-library-action-20261121/`.

### Game catalog detail metadata

Lumen game detail now displays the catalog's Steam Library ownership badge,
all available Quick Finish, Main Story, and Completionist estimates in hours,
and named YouTube videos. Video IDs are checked against the provider's
11-character allowlist before constructing a YouTube URL. The page now labels
its existing screenshot gallery, and its release, developer, publisher, and
platform labels follow English, French, and Arabic. Request targets, request
permissions, and My Games behavior are unchanged.

The browser fixture passes four viewport cases against standalone production
and four against the production Express `/lumen/` mount. It verifies French
labels and number formatting, all estimate values, Steam ownership, safe video
links, and no-request-permission behavior. Baseline and candidate desktop and
iPhone renders were inspected in both deployments, with no page-width overflow.
The fixture blocks external requests, so screenshot image payloads and live
provider values remain unverified; independent linguistic review is also open.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-game-detail-metadata-20261121/`.

### Bulk book request localization

The shared author and book-series bulk-request sheet now localizes its format,
advanced destination and requester controls, selection limit, load/submit/retry
feedback, result counts, accessibility labels, and dismissal action in English,
French, and Arabic. Request eligibility, the selected work and edition identity,
format-specific destination options, bulk request payload, and result handling
remain unchanged.

Twelve browser cases pass across desktop, iPhone, Android, and tablet. They
exercise the selected-work state and fully configured destination fields in all
three locales, including Arabic RTL. English and Arabic captures were inspected;
the sheet remains within the viewport and keeps its existing shared sheet and
form-row owners. Existing author and series request contract tests were rerun.
Live provider submission and independent linguistic review remain unverified.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-bulk-book-localization-20261122/`.

### Book-series audiobook narrator planning

Book-series detail now shows the native narrator coverage planner when
audiobooks are enabled for both the server and the signed-in user. It reports
coverage, owned and missing volumes, full-cast/complete sets, and alternate
narration availability. Users can follow a narrator; only request managers see
the action that saves a preferred narrator through the existing authorized
API. This retains the separate ebook and audiobook category controls.

Production build and focused book-grouping browser coverage passed across
desktop, iPhone, Android, and tablet; matched baseline/candidate captures were
inspected at desktop and iPhone sizes. Provider results and preference writes
against a live server remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-book-series-narrator-planner-20261122/`.

### Large-series episode metadata batching

Lumen's TV episode request sheet now loads season metadata through the existing
bounded batch endpoint instead of issuing a separate request for every season.
The server caps provider concurrency, retries provider-missing seasons
serially, and returns successful seasons even when one remains unavailable.
Lumen preserves already loaded seasons and the selected deep-linked episode,
then retries only seasons missing from the partial response. When a season
remains unavailable, episodes from loaded seasons remain selectable and the
submit action includes only the selected, loaded episode identities. Missing
season details remain visibly incomplete and retryable. A 15-season fixture
verifies one initial batch, a one-season retry, and preserved selection across
desktop, iPhone, Android, and tablet. Twenty-four localized failure/recovery
cases and eight large-series selection/payload cases pass across the supported
viewports. French desktop (1440 × 900) and Arabic iPhone baseline/candidate
captures show the partial-load warning, enabled loaded episodes, and usable
submit action without clipping or horizontal overflow. The reported
real-provider failure remains unverified against the reporter's server.

A follow-up diagnosis found another failure path shared by native and Lumen:
the season endpoint first fetches full series metadata to identify anime and
select its provider. If that lookup fails, the entire batch previously returned
500 before attempting any season. The endpoint now falls back to the configured
TV provider when no per-user TV maturity cap depends on the missing rating
metadata; users with a cap still fail closed. Focused route regressions verify
both the recovery and the maturity-cap denial, and the server typecheck passes.
This establishes recovery for the reproduced lookup failure, but does not
establish that it caused the reporter's incident or verify their live provider.

The native request modal still preselected every unavailable season and kept
the submit action blocked after a partial metadata response. Ordinary requests
now allow a user to clear that default and choose episodes from loaded seasons;
changing the selection drops unloaded seasons, and the warning explains that
retry is needed to include them. Episode Queue requests allow choosing a
starting episode from a loaded season and preserve the queue buffer. A full-app
fixture forces a 13-season series to retain only season 1 metadata, then
verifies both request modes and the exact submitted season and episode at 390
and 1440 CSS pixels. All four cases pass, and the rendered warning, picker, and
request action were inspected at phone and desktop sizes.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-native-partial-20261123/results/`.
This does not resolve a provider outage where no season metadata is returned;
the screenshot's live-provider cause remains unverified.

### Coming Soon to Release Calendar navigation

Lumen Coming Soon now includes the native page's contextual Release Calendar
link. It reuses the account-locale label from the profile navigation and the
shared quiet-button style; the calendar route, request controls, and feed
behavior are unchanged.

The browser fixture verifies the localized destination and the existing movie
request payload in English, French, and Arabic on desktop and iPhone (6 cases).
Matching English baseline and candidate screenshots at 1440 × 900 and 390 ×
844 show the link beneath the release list with no other layout changes.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-coming-soon-calendar-20261122/`.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-tv-partial-recovery-20261122/`.

### Shared music and adult request feedback localization

The shared extra-media request button now localizes its default label, success
toast, and generic failure feedback in English, French, and Arabic. Music keeps
its page-specific “request album” label; structured API errors continue through
the existing localized error formatter. Request payloads and permission gates
are unchanged.

Twelve browser cases pass across desktop, iPhone, Android, and tablet, checking
the music failure and retry path, adult default action, request payloads, RTL
direction, and viewport overflow. French desktop music detail baseline and
candidate renders were inspected and retain the same action layout. Arabic
iPhone candidate was inspected. The baseline adult detail route remains in its
loading state with the fixture, so the adult button’s matched visual acceptance
is unverified. Live submission and independent linguistic review are also
unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-shared-request-localization-20261122/`.

The earlier Adult detail capture blocker was caused by the fixture matching only
standalone API paths. The fixture now strips the `/lumen` deployment prefix and
opens the matching routes in either deployment. English Adult and Music detail
actions and successful request feedback pass on desktop and iPhone against the
standalone build and bundled `/lumen/` assets. The rendered Adult action is now
confirmed in both layouts. A native seeded-admin detail capture then exposed an
additional parity gap: native's request workflow can select any configured
Whisparr destination, while Lumen submitted directly to the current scene's
service. Lumen now offers the authorized destination picker on the scene detail,
reloads that server's availability state, and submits the selected server ID.
The shared fixture suite verifies the selected destination and request body in
English, French, and Arabic across desktop, iPhone, Android, and tablet; it also
checks RTL and horizontal overflow. Phone captures confirm that the selector and
request button fit together in the sticky bar. Native desktop and phone captures
use the seeded admin and fixture scene. These checks do not prove live Whisparr
behavior. A native-matched visual review of the Music controls and the remaining
detail-page layouts, live submission, and independent linguistic review remain
open. Additional screenshots
are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-shared-request-visual-20261122/`.
The new destination-picker desktop and phone captures, plus seeded native Adult
baselines at 1440px and 390px, are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-controls-20261123/`.

### Music format-specific requests

Album detail now exposes separate MP3 and FLAC request actions, matching native
SeerrNG's format choices. Each action uses a matching configured Lidarr service,
reports when that format is already available, blocklisted, pending, or has no
configured service, and sends the selected destination server ID. Users with
request-option permission can choose among multiple services for that format.
Album and artist details also expose the native Request Discography entry
points. The album link retains its exact album ID; the artist link opens the
artist-wide workflow. Both remain behind the music request permission gate.
Artist detail also supports the native Follow New Albums rule, retaining its
MusicBrainz identity and include/exclude release-type conditions.

The focused browser suite passes 96 cases across desktop, iPhone, Android, and
tablet, including localization and request-permission coverage. The MP3/FLAC
payload, availability and pending states, and unconfigured-format recovery are
fixture checked. A route fixture verifies both discography destinations and
their media identity. A follow fixture checks the exact artist rule payload.
Native and Lumen album detail were captured at desktop size;
Lumen was also captured on phone, where the sticky bar was adjusted after visual
inspection to keep both format workflows within the screen. Native phone visual
comparison for the album action bar remains unverified. Native and Lumen artist
detail were captured and inspected at desktop and iPhone sizes; the follow and
discography actions stay within the existing responsive action group. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-shared-request-native-visual-20261122/`.
Live Lidarr submission, live provider states, and independent linguistic review
remain unverified.

### Requests manager display localization and mobile search recovery

The Lumen Requests manager now localizes its page heading, Book Series shortcut,
scope tabs, helper text, refresh guidance, load failure and retry, empty state,
requester/media/format/sort/date filters, search, clear-search, and paging
controls in English, French, and Arabic. Existing filter values, URL/API
behavior, and request authorization are unchanged. On narrow screens, the
search field wraps its clear action when needed; the shared search owner scopes
this behavior to toolbars with a separate button, leaving Admin Users unchanged.
Some per-request status and action copy remains a separate parity item.

Twelve browser cases pass across desktop, iPhone, Android, and tablet in all
three locales. They verify localized controls and empty/error/retry states,
existing URL filters, search/clear behavior, and no horizontal overflow. English,
French, and Arabic baseline/candidate captures were compared at desktop and
iPhone sizes for the empty and failed-load states; English geometry is unchanged,
and the French and Arabic layouts remain within the viewport. A focused French
iPhone Admin Users consumer check passed after the shared CSS was scoped. The
standalone and integrated production builds pass; the localization checker
reports the existing catalog backlog. Live-provider behavior and independent
linguistic review remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-filter-localization-20261122/`
and `/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-manager-display-20261122/`.

### Request cancellation action localization

The request list now localizes the request-history and cancel actions, and the
pending-request confirmation sheet's title, explanation, confirm, and keep
labels in English, French, and Arabic. The cancel path still calls the existing
request cancellation API only after confirmation; request permissions and list
state behavior are unchanged. The following moderation milestone covers the
administrator review path and its mutation feedback.

The status and cancel-confirmation fixture passes across desktop, iPhone,
Android, and tablet in all three locales (12 candidate cases). Matched baseline
and candidate list/dialog captures were reviewed at desktop and iPhone sizes;
the Arabic mobile sheet settles above the bottom navigation and its translated
copy and buttons fit. Live cancellation and independent linguistic review
remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-action-localization-20261122/`.

### Request moderation confirmation and feedback localization

The manager-only request view now localizes decline, request removal, and
managed-copy removal confirmation sheets, along with approval, decline, retry,
removal, cancellation, and generic mutation failure feedback in English,
French, and Arabic. The existing manager permission gate and request/media
endpoints are unchanged. The localized decline confirmation includes the
requester-facing consequence before the manager confirms.

The manager review and cancellation fixture passes across desktop, iPhone,
Android, and tablet in all three locales (12 candidate cases); it checks
localized decline confirmation copy and cancellation success feedback without
submitting the decline. Matched baseline/candidate captures were reviewed at
desktop and iPhone sizes; the dialog remains usable in French and Arabic RTL.
Live moderation and removal behavior and independent linguistic review remain
unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-moderation-localization-20261122/`.

### Shared request lifecycle status localization

Lumen now translates shared request lifecycle labels in English, French, and
Arabic, including approval, search, import, library-check, failure, declined,
cancelled, unavailable, different-edition, 4K-server, and over-quota states.
The shared card status owner applies to Requests, detail and discovery cards,
and household request previews. Queue and download progress keep their existing
localized formatting. The Requests row also localizes the explanation shown
when a pinned book request is fulfilled by a different edition; provider-owned
status messages remain as supplied.
Request state, filtering, retry, and authorization behavior are unchanged.

The lifecycle fixture passes on desktop, iPhone, Android, and tablet in all
three locales (12 cases), including the different-edition explanation.
Existing shared poster-status coverage passes in the same matrix (12 cases).
Matched baseline/candidate request-list captures at
desktop and iPhone sizes were reviewed for English, French, and Arabic; the
status text changes while card geometry is preserved, and no locale overflows
the viewport. Live provider responses and independent linguistic review remain
unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-status-localization-20261122/`.

### Request row queue context and ETA localization

The Requests list now localizes the automatic-queue label, queued episode count,
and download ETA detail in English, French, and Arabic. Existing queue counts,
download progress, filtering, request lifecycle state, and action behavior are
unchanged. The ETA formatter receives the active locale only when rendering the
Requests list; the shared request status calculation retains its English
fallback for nonlocalized callers.

The fixture covers both queue labels and a scheduled audiobook ETA. Twelve
baseline and twelve candidate browser cases pass across desktop, iPhone,
Android, and tablet in all three locales. Matched baseline/candidate captures
were inspected at 1440 CSS pixels and phone size for English, French, and
Arabic; translated queue and ETA copy fits without new overflow or geometry
changes. Live provider data and independent linguistic review remain
unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-row-localization-20261122/`.

### Partial TV request explanation localization

Lumen now localizes the Requests-row explanations for newly airing episodes,
partially missing episodes, and requested seasons that have not appeared in the
library. Single and multiple season labels retain their season numbers and
compressed ranges. The existing request and season status calculations are
unchanged.

Fixture coverage passes for airing and ended shows, one missing requested
season, and multiple missing seasons with a range. Twelve baseline and twelve
candidate browser cases pass across desktop, iPhone, Android, and tablet in
English, French, and Arabic. Matched baseline/candidate captures were inspected
at 1440 CSS pixels and phone size in French and Arabic; translated detail wraps
within the existing row layout, and no viewport overflow was detected. Live
metadata and independent linguistic review remain unverified. Evidence is
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-tv-partial-status-20261122/`.

### Invalid request-history link feedback localization

Malformed numeric or textual request-history links now show a localized alert
in English, French, and Arabic. The link validation rule and request lookup
behavior remain unchanged.

The fixture passes in twelve candidate and twelve baseline runs across desktop,
iPhone, Android, and tablet in all three locales. The invalid-link alert is
checked after the mocked request list loads, and the route is checked for
horizontal overflow. Matched captures at 1440 CSS pixels and phone size were
reviewed in French and Arabic; the alert changes text without altering the
layout. Live link destinations and independent linguistic review remain
unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-link-localization-20261122/`.

### Media-server play-link localization in Requests

Completed movie and music requests now use the selected media-server name in
localized “Watch on” and “Listen on” actions in English, French, and Arabic.
Plex URL validation, 4K URL selection, and link behavior are unchanged.

The browser fixture exercises a completed 4K movie and a completed music album.
Twelve candidate and twelve baseline cases pass across desktop, iPhone,
Android, and tablet in all three locales. Matched captures at 1440 CSS pixels
and phone size were inspected in French; only the action copy changes, without
new overflow or geometry changes. Live media-server URLs and independent
linguistic review remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-play-link-localization-20261122/`.

### Media-server labels across movie details and cards

Movie detail playback actions now localize HD and 4K labels, and the 4K
availability fact and badge use the existing localized server-status labels.
Shared title cards now localize both their external “Watch on” action and their
in-app “On” status action. Media-server name selection, 4K distinction, URL
validation, and navigation targets are unchanged.

The browser fixture verifies both movie playback URLs and 4K status copy, plus
card actions with and without an external playback URL. Twenty-four candidate
and twenty-four baseline browser cases pass across desktop, iPhone, Android,
and tablet in English, French, and Arabic. Matched 1440px and phone captures
were reviewed in French; the translated actions fit the existing controls and
the card/detail geometry is unchanged. Live server links and independent
linguistic review remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-movie-media-labels-20261122/`.

### Requested-season badge localization

The requested-season badge on TV detail pages now uses the shared localized
request-status message in English, French, and Arabic. Request eligibility,
season locks, and status calculations are unchanged.

Twelve candidate and twelve baseline browser cases pass across desktop, iPhone,
Android, and tablet for all three locales. Matched French desktop and phone
captures were inspected after scrolling the requested season into view; the
badge copy changes without modifying the row geometry. Live request state and
independent linguistic review remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-tv-season-status-localization-20261122/`.

### Request list paging localization

The Requests page's incremental list control now localizes both its idle
“Show more” label and its in-flight “Loading…” label in English, French, and
Arabic. Paging size, list queries, loaded request rows, and authorization are
unchanged.

Twelve standalone browser cases pass across the three locales and desktop,
iPhone, Android, and tablet. French and Arabic also pass in the bundled
`/lumen/` build across the same viewport matrix. The fixture holds the expanded
page response to verify the loading label before confirming the new rows load.
French desktop baseline and candidate captures were compared; the translated
label is the only visible change and the page remains within the viewport.
Viewport overflow checks pass for the tested locales and layouts. Live
request-list behavior and independent linguistic review remain unverified.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-paging-localization-20261122/`.

### Request lifecycle filter localization

The manager's ten Requests lifecycle filters now follow the saved English,
French, or Arabic locale, including the All, Waiting, Downloading, Incomplete,
Needs attention, Unavailable, Failed, Completed, Available, and Software
labels. Filter values, counts, query parameters, and manager access checks are
unchanged.

Twelve standalone browser cases pass across the three locales and desktop,
iPhone, Android, and tablet. Matched French desktop and iPhone baseline and
candidate captures were inspected; the translated filters wrap naturally in
the existing chip layout, with no horizontal overflow. Live filter results and
independent linguistic review remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-paging-localization-20261122/filters-baseline/`
and
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-paging-localization-20261122/filters-candidate/`.

### Row-level Episode Queue editor localization

The request-row Episode Queue editor now localizes its title, instructions,
pending-request guidance, account-default loading and error messages, queue
length options, save and cancel controls, and success feedback in English,
French, and Arabic. The manager permission check, eligible request statuses,
request endpoint, and submitted episode-count payload are unchanged. Twelve
standalone browser cases pass across English, French, and Arabic on desktop,
iPhone, Android, and tablet. Eight French and Arabic cases pass in the bundled
`/lumen/` build across the same viewports. French desktop and iPhone baseline
and candidate captures were inspected; the translated sheet fits its existing
layout. Live server behavior and independent linguistic review remain
unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-episode-queue-localization-20261122/`.

### Large-series episode request recovery

The TV episode picker now requests metadata for at most five seasons per
client call. When later batches remain pending, users may expand loaded seasons
and change selections immediately; submission stays disabled until loading
finishes. Failed seasons remain individually retryable, and already selected
episode identities remain intact. The provider route still performs at most
three metadata lookups concurrently, and the server's request rate limit and
endpoint contract are unchanged.

Browser regressions cover a 15-season request split into three exact batches,
retry of only the missing fifteenth season, selection from loaded seasons while
the final batch is held pending, preservation of that selection through partial
recovery, and the exact submitted season and episode IDs. Twelve cases pass on
desktop, iPhone, Android, and tablet in both the standalone and bundled
`/lumen/` builds. Matched baseline/candidate desktop and iPhone captures show
that the legacy 15-season call leaves every episode unavailable while pending,
whereas the candidate permits selecting from the first completed batches while
the final batch is still loading. This fixture verifies client behavior, not
the reporter's live metadata provider or reverse-proxy timeout. Evidence is
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-large-series-episode-batching-20261122/`.
The standalone 15-season and partial-recovery matrix was rerun on 2026-11-23;
all 16 cases passed across desktop, iPhone, Android, and tablet. This confirms
the Lumen fixture behavior and does not resolve the reported live SeerrNG
provider failure.

### General and request-default administration navigation

General Settings and Request Defaults now translate their cross-page
navigation labels in English, French, and Arabic. Request Defaults also passes
a localized service-description label into its recoverable settings note. The
existing routes, permissions, settings endpoints, and save behavior are
unchanged. The browser fixture now follows the current route ownership: request
policy and quotas are tested on Request Defaults, while API-key controls remain
on General Settings.

The default-permissions editor also exposes its localized accessible group
name in English, French, and Arabic. This changes no permission values or save
behavior. Twelve locale and viewport checks pass, including the localized
group name in the administrator workflow. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-permission-group-20261122/`.

Twelve standalone and twelve bundled `/lumen/` browser cases pass across the
three locales and desktop, iPhone, Android, and tablet. French baseline and
candidate captures cover both routes at 1440 and 390 CSS pixels; longer labels
wrap within the existing navigation and page layout, with no page-level
horizontal overflow. The fixture validates mocked settings writes and retries;
live administrator settings and independent linguistic review remain
unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-general-acceptance-20261122/`.

### About page metadata and support parity

The Lumen About screen now shows the TMDB logo linked to TMDB, retains the
localized API-terms link, and presents Ko-fi under a separate Support SeerrNG
section, matching the native page's attribution and support destinations. The
About browser fixture also now checks the logo destination and localized
support heading. Its English TMDB terms expectation was corrected to match the
native translation text.

Twelve standalone production browser cases pass across English, French, and
Arabic on desktop, iPhone, Android, and tablet. They check the logo destination,
support links, release recovery, and page overflow. Matching English baseline
and candidate captures were inspected at 1440 and 390 CSS pixels; French and
Arabic candidate renders were also inspected. Standalone and bundled production
builds compile. API behavior is unchanged. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-about-parity-20261122/`.

### Games catalog localization

The Games catalog now localizes its page heading and request guidance, shortcut
links, platform group and tabs, search prompts, catalogue-unavailable message,
empty state, and game status/category labels in English, French, and Arabic.
Catalog queries, platform selection, permissions, and request behavior are
unchanged. Twelve browser cases cover locale content, shortcuts, platform
switching, search, empty results, RTL direction, and overflow across desktop,
iPhone, Android, and tablet. Matching baseline and candidate desktop and phone
captures were inspected; candidate French and Arabic renders were also reviewed.
Live service behavior and independent linguistic review remain unverified.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-game-catalog-20261122/`.

The PC game detail request form now localizes its operating-system and build
selectors, choice prompts, request action, pending-approval and success
feedback, quota error, and game-specific translations link in the same three
locales. Twelve additional cases cover these form controls across the same
four viewports. Request payloads, permission checks, and provider error handling
remain unchanged. French baseline and candidate desktop and iPhone captures
were compared; only the selector prompts and request button change, while the
existing mobile action bar remains intact. A further 24 browser cases cover
supported retro-console selection and its patch link, plus the unsupported
modern-console message, across English, French, and Arabic on desktop, iPhone,
Android, and tablet. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-game-catalog-20261122/detail-baseline/`
and
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-game-catalog-20261122/detail-candidate/`.

### Sports catalog localization

The Sports catalog now localizes its heading and guidance, search placeholder,
team follows link, search-first empty state, no-results recovery text, and
followed/requested card status in English, French, and Arabic. Search query
handling, league routes, provider calls, and request permissions are unchanged.
The browser fixture covers initial and no-results states, RTL direction, and
viewport overflow across desktop, iPhone, Android, and tablet. Matched French
desktop and iPhone baseline and candidate captures were inspected; candidate
Arabic was also reviewed. League detail, event schedules, paging, and follow/request sheet copy now also
localize in English, French, and Arabic. The workflow fixture covers loaded
events, details, follow/request states, locale direction, and viewport overflow
across desktop, iPhone, Android, and tablet (12 cases). Matched French desktop
and iPhone baseline/candidate renders and the Arabic desktop candidate were
inspected. Live Sportarr behavior and independent linguistic review remain
unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-sports-workflow-localization-20261122/`.

### Swipe workflow localization

Swipe's deck search, category names, filters, favorites, saved preferences,
keyboard help, request actions, loading and empty states, and error feedback now
follow English, French, or Arabic. Swipe History already localizes its own
history controls and remains part of the same workflow. Decision semantics,
request payloads, category availability, and preference persistence are
unchanged. New browser fixtures pass across desktop, iPhone, Android, and tablet
for all three locales (12 cases); 24 existing Swipe workflow regression cases
also pass. Matched French desktop and iPhone baseline/candidate renders and an
Arabic desktop candidate were inspected. Layout and control ownership remain
unchanged, and all tested pages avoid horizontal overflow. Live recommendation
providers and independent linguistic review remain unverified. Evidence is
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-swipe-localization-20261122/`.

### Adult catalog localization

The Adult catalog now localizes its heading, guidance, search field, service
filter, partial-result warning, empty states, and pagination error/retry/loading
messages in English, French, and Arabic. Compact localized service labels keep
the existing mobile selector geometry usable. Provider-supplied scene titles,
service names, permissions, queries, and request behavior are unchanged.

The browser fixture covers loaded partial results, service filtering, search
empty states, RTL direction, and viewport overflow across desktop, iPhone,
Android, and tablet (12 locale/viewport cases). French desktop and iPhone
baseline/candidate renders and Arabic desktop and iPhone candidates were
inspected; the existing layout and controls remain intact. Live Whisparr
behavior and independent linguistic review remain unverified. Evidence is
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-adult-catalog-localization-20261122/`.

### Comics and Manga catalog localization

The Comics and Manga catalog now localizes its heading and guidance, type and
library selectors, sorting and manga status controls, ComicVine catalog search
filters, browse shelves, indexing progress and recovery, and empty states in
English, French, and Arabic. The existing search URLs, selected filters,
catalog paging and retry behavior, AniList manga results, ComicVine publisher
filter, and request actions are unchanged. Provider-owned titles, publishers,
genre names, and edition metadata remain as supplied by their catalogs.

Twelve browser cases pass across desktop, iPhone, Android, and tablet for all
three locales, including RTL direction and horizontal-overflow checks. The
complete Comics and Manga browser workflow passes 84 cases with 28 existing
device skips. Matched English baseline/candidate captures at 360, 768, and
1280 pixels were generated from the same fixture; the 360-pixel views were
inspected. French and Arabic desktop and phone candidates were inspected.
Catalog detail and issue pages now localize their shared Reader Shelf controls;
see the Reader Shelf entry below. Live AniList/ComicVine behavior and
independent linguistic review remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-comics-localization-20261122/`.

### Reader Shelf localization

The shared Reader Shelf panel now localizes its setup, preview, create, save,
and saved-result controls in English, French, and Arabic. This closes the
English-only control gap on Comics detail and the shared author and book-series
entry points. Existing reader visibility restrictions, consent before creating
an empty shelf, provider targets, and API payloads are preserved.

The focused browser suite passes 24 cases across desktop, iPhone, Android, and
tablet, including exact save payload/readback assertions and the BookOrbit
visibility lock. The same workflow also passes through a production build
served by SeerrNG's Express `/lumen/` mount. Matched French iPhone comic-detail
baseline/candidate captures and French/Arabic mobile Reader Shelf states were
inspected; no horizontal overflow was found. Live reader integrations and
independent linguistic review remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-reader-shelf-localization-20261122/`.

### Book author and series localization

Author bibliographies and book series pages now localize their headings,
filters, pagination, book counts, and empty states in English, French, and
Arabic. Provider supplied author names, book titles, subjects, and language
names remain intact. Filtering, sorting, selection, request, and reader
behavior are unchanged.

Twelve browser cases pass across desktop, iPhone, Android, and tablet using
localized account settings. They verify author pagination labels, series
filter accessibility and options, Arabic direction, and page overflow.
French iPhone and Arabic desktop candidate captures were inspected. A matched
English baseline/candidate captures match pixel-for-pixel at desktop and iPhone
sizes. Live provider behavior and independent linguistic review remain
unverified. Evidence is at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-book-grouping-localization-20261122/`.

### ROM patch catalogue and request localization

The patch catalogue and patch detail workflow now localize discovery filters,
project kinds and statuses, pagination, version and system controls, disabled
request explanations, and request feedback in English, French, and Arabic.
Provider project names, language codes, system names, version identifiers, and
notes remain unchanged. Existing account permissions, compatibility checks,
query state, and request payload are preserved.

Twenty browser cases pass: the new locale matrix across desktop, iPhone,
Android, and tablet plus the existing patch workflow suite. The new matrix
checks the exact submitted payload and no horizontal overflow. English
baseline/candidate captures match pixel-for-pixel at desktop and iPhone sizes;
French iPhone and Arabic desktop were inspected. Live ROMarrNG catalogue and
acquisition behavior and independent linguistic review remain unverified.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-patches-localization-20261122/`.

### Curated collection workflow localization

Curated TV and music collection pages now localize collection headings and
states, availability refresh and filters, TV series and music release request
sheets, collection blocklisting and confirmation, and media server add/remove
verification in English, French, and Arabic. Provider supplied collection,
series, release, library, genre, and service names remain unchanged. Existing
permissions, catalog filters, server sync selection/removal tokens, and request
payloads are preserved.

Twelve browser cases pass across desktop, iPhone, Android, and tablet for all
three locales. They exercise TV collection sync add/remove verification,
series requests, blocklisting, and music release filter and bulk request flows;
exact API payloads, Arabic direction, and horizontal overflow are checked. The
five existing curated collection workflow regressions also pass. Matched
English baseline/candidate series page captures are pixel-identical at desktop
and iPhone sizes. French iPhone and Arabic desktop request sheets were
inspected. Live media server and music provider behavior and independent
linguistic review remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-curated-localization-20261122/`.

### People and filmography localization

People pages now localize person fallbacks, profile recovery and loading states,
filmography sections and media filters, sort labels and directions, and bulk
movie request confirmation and result summaries in English, French, and Arabic.
Provider supplied names, biographies, departments, credit roles, and movie
titles remain unchanged. Category and request permissions, deduplication,
batching, request payloads, and default movie settings are unchanged.

Twelve browser cases pass across desktop, iPhone, Android, and tablet for all
three locales. They verify localized filmography filters and sections, bulk
request confirmation and exact unique movie IDs, Arabic direction, and page
overflow. Existing People search, privacy, credit filtering, safe portrait,
and sort regressions pass. Live TMDB data and independent linguistic review
remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-people-localization-20261122/`.

### Share and Identify localization

The Share and Identify workflow now localizes its input and book-format
controls, barcode and image-recognition recovery, match selection, title
destinations, TV season selection, request feedback, and streaming-policy
override sheet in English, French, and Arabic. Provider supplied titles,
creator names, ISBN values, candidate evidence, and server-returned streaming
policy messages remain unchanged. Authentication, request permissions, image
size limits, barcode parsing, candidate identity, and request payloads are
unchanged.

Twelve browser cases pass across desktop, iPhone, Android, and tablet for all
three locales. They verify localized recognition and match labels, exact TV
request bodies including the explicit streaming-policy override, saved locale,
Arabic direction, and no horizontal overflow. The 20-case existing Share
workflow suite passes across all four viewports, including visibility and
request policy. English baseline/candidate modal captures match pixel-for-pixel
at desktop and iPhone. Live resolver and barcode services and independent
linguistic review remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-share-localization-20261122/`.

### First-run Setup localization

The Setup wizard and first-run sign-in now receive Lumen's saved account
locale, or the browser locale before sign-in. Page-owned step navigation,
service grouping, review results, loading and recovery messages, and Plex,
Jellyfin, and Emby sign-in labels are localized in English, French, and
Arabic. Shared category, library, download-client, Prowlarr, and Servarr
settings forms also consume the selected locale through the same provider.
Service names, library names, credentials, authentication routes, category
permissions, and setup API writes remain unchanged.

Twenty-four browser cases pass across desktop, iPhone, Android, and tablet for
the guided review/service steps and anonymous first-run sign-in in all three
locales. Five existing setup regressions pass, covering administrator access,
Plex authentication, Jellyfin and Emby sign-in, category saves, and request
service configuration. English baseline/candidate review and service-step
captures are pixel-identical at desktop and iPhone sizes. French iPhone and
Arabic desktop renders were inspected; Arabic direction and page overflow pass
at all viewports. Live media-server discovery and independent linguistic
review remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-setup-localization-20261122/`.

### Indexer Search setup navigation

When Prowlarr is unconfigured, administrators now get a direct link to its
settings from Lumen's Indexer Search page. The link reuses SeerrNG's existing
localized label and points to the correct route in both standalone and bundled
Lumen. Request managers without administrator permission do not see it.

The full 40-case Indexer Search suite passes across desktop, iPhone, Android,
and tablet in standalone and bundled deployments. French and Arabic admin and
request-manager cases pass in both deployments. Matched before/after captures
were reviewed at desktop and iPhone sizes. Prowlarr provider handoff remains
unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-indexer-config-link-20261122/`.

### Indexer Search in-flight form parity

While a search request is pending, Lumen now disables the search query field as
well as the category selector. This matches native SeerrNG and prevents the
visible query from changing while results for the submitted value are loading.
Both controls become available again when the request completes.

The delayed-search browser case verifies the disabled and restored states. The
full 40-case Indexer Search suite passes in standalone and bundled Express
`/lumen/` deployments across desktop, iPhone, Android, and tablet. Matched
before/after screenshots at desktop and iPhone sizes show unchanged layout.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-search-lock-20261122/`.

### Indexer Search populated results on phones

Matched native and Lumen captures with two populated release fixtures at
desktop and phone sizes. The comparison exposed a narrow-screen flex issue:
when details and actions were present, result titles could collapse to a few
characters per line. Indexer Search now gives the result details their own row
on narrow screens, keeping titles readable and actions reachable. This change
is scoped to the Indexer Search result list.

The native capture and Lumen regression case use mocked Prowlarr results; they
verify layout and handoff interaction, not a live Prowlarr or download-client
connection. The focused browser case passes on desktop, iPhone, Android, and
tablet. Captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-indexer-state-guidance-20261123/`.

### Content-restricted Adult navigation

Lumen now applies SeerrNG's Adult content restriction rule to its shared
visible-extra list. Restricted users no longer see Adult in the navigation,
Discover shortcuts, or Search category choices. Explicit per-user settings
override the instance default, and administrators keep the native default
exemption. Server-side Adult permission checks remain authoritative.

The 36-case Adult navigation permission suite passes in standalone and bundled
Express `/lumen/` deployments across desktop, iPhone, Android, and tablet. It
checks instance defaults, per-user overrides, administrator behavior, and
existing Adult permissions. Matched desktop and iPhone baseline/candidate
captures were inspected. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-adult-menu-20261122/`.

### Discover result to detail navigation

Lumen now preserves the ordered, filtered result context when opening movie or
series details from Browse, the main Discover movie/series/upcoming shelves,
Trending, public TMDB lists, configured video shelves, and the Discover
Watchlist. Detail pages expose previous and next controls only when the URL
context matches the current media identity; direct detail links remain
control-free. Context lives in bounded, tab-local session storage and is capped
at 5,000 results and 12 contexts.

The browser workflow passes for movie and TV results on desktop and iPhone in
standalone preview and the production Express `/lumen/` mount. It verifies
opening from results, forward and backward navigation, end-of-list behavior,
identity-mismatch and direct-link behavior, and phone-width overflow. A
Discover Watchlist case verifies its filtered result context and adjacent
navigation on desktop and iPhone. The desktop and iPhone detail captures were
visually inspected. Filtered catalog behavior on native Discover pages that
have no Lumen equivalent, and live catalog data, remain outside this increment.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-discover-navigation-20261122/`.

### Upcoming series and category-aware Coming Soon

Lumen now shows an Upcoming Series shelf on Discover and lets TV-only accounts
use Coming Soon from the menu. The route and its filters fetch only enabled
movie or TV catalogs, and the Coming Soon shortcut is hidden when neither
video category is enabled. The shelf reuses SeerrNG's existing localization
key and links to the TV-filtered Coming Soon view.

TV-only desktop and iPhone browser cases pass, including menu visibility,
Discover shelf visibility, the active Series filter, and checks that disabled
movie endpoints are never requested. The production build passes. Candidate
screenshots at desktop (1440px) and iPhone (390px) are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-upcoming-series-20261122/`.
The candidate was inspected at both sizes; baseline comparison and live catalog
provider behavior were not exercised in this increment.

### Software catalog filters

Lumen's Games catalog now sends the filters supported by SeerrNG's software
catalog API: operating system for PC games, emulation system for retro and
modern catalogs, and genre and release year where the selected catalog supports
those fields. Release years outside 1950–2200 are rejected in the UI before a
catalog request is sent. ROMarrNG DAT catalogs expose their supported system
filter while hiding genre and year controls that the backend cannot apply.

Browser coverage verifies filter query parameters and invalid-year recovery,
including DAT behavior, across desktop and iPhone in English, French, and
Arabic. The Lumen production build passes. Matched baseline/candidate captures
at desktop (1440px) and iPhone (390px) were inspected; evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-game-catalog-filters-20261122/`.
Live QuestarrNG and ROMarrNG catalog responses were not exercised.

### Mobile navigation menu

Lumen's phone navigation now has a **More** control that reveals the same
permission- and category-filtered navigation as the desktop sidebar. The panel
provides access to enabled catalogs, administration, requests, downloads,
issues, the calendar, library, and account destinations without removing the
existing Discover, Search, Requests, or You tabs. Books remains available in
the menu. Escape, selecting a destination, tapping outside, and the More control
close the panel; the More control exposes its expanded state to assistive
technology. Its filters and authorization continue to use the existing Lumen
navigation and route/API owners.

Desktop, iPhone, Android, and tablet browser coverage verifies the localized
More control, enabled categories, utility destinations, escape, outside-click,
route-selection behavior, and long-page tab-bar behavior. A restricted-user
matrix verifies disabled movie/books entries and permission-gated utilities at
320 × 568, with no horizontal overflow and scroll access to the bottom profile
entry. Matched desktop and iPhone baseline/candidate captures were inspected;
the compact phone candidate was inspected as well. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-mobile-more-20261122/`.
Live permission changes and route/API authorization remain server-owned.

### Swipe and recognition settings save readback

The administrator Swipe and Share-to-Request recognition forms now confirm
each write against both the PUT projection and a fresh GET before clearing
drafts, API-key intent, or reporting success. They compare normalized public
settings and configured/cleared key state without reading or echoing secrets.
On a mismatch, the forms retain edits and offer the existing retryable error.

Stale-readback failure and retry cases pass on desktop, iPhone, Android, and
tablet (28 cases), including the Swipe navigation permission matrix. The
recognition save flow also passes in French and Arabic at desktop and phone
sizes. Desktop and iPhone failure-state captures were inspected; the alert and
retry controls remain visible in the viewport. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-settings-readback-20261122/`.
Fixtures verify the client behavior only; live filesystem/settings persistence,
provider connectivity, matched native baseline comparison, and independent
translations remain unverified.

### Prowlarr administration save readback

Prowlarr administration now verifies the saved connection fields and API-key
configured state in both the successful PUT response and a fresh GET before
clearing the draft or showing success. A stale readback preserves the current
configuration draft and displays the existing retryable save error. The API key
remains write-only in the public settings projection.

All 12 Prowlarr browser cases pass across desktop, iPhone, Android, and tablet.
Coverage includes stale readback followed by a successful retry, indexer
routing edits, existing secret preservation, localization, and page overflow.
Fixtures exercise client behavior only; live Prowlarr persistence, indexer
connectivity, and matched native visual comparison remain unverified.

### Navidrome and Jellystat connection save readback

Lumen now verifies the public URL, Navidrome username and scan setting, and
redacted credential presence in both the PUT response and a fresh GET before
clearing credentials or drafts. Disconnect now confirms the GET projection is
empty before clearing the form. A stale response retains the entered values
and leaves save or disconnect retryable.

Twelve browser cases pass across desktop, iPhone, Android, and tablet, including
stale save readback, saved-password reuse, disconnect readback, and the
English, French, and Arabic connection workflows. Desktop and iPhone
recoverable error captures were inspected; the settings and retry action remain
visible. Fixtures do not prove live Navidrome/Jellystat connectivity or
filesystem persistence.

### Download client settings save readback

Lumen's Live Download Progress settings now verify the polling interval and
each configured client's public connection fields and credential-configured
state in both the PUT response and a fresh GET. Saved credentials remain
write-only. A stale readback keeps the edits and credential intent in place so
the administrator can retry.

The existing credential save flow passes on desktop, iPhone, Android, and
tablet, with failure/retry coverage and English, French, and Arabic. Desktop
and iPhone failure-state screenshots show the existing client settings and
retry controls visible without horizontal overflow. The mocked API does not
verify live download-client connectivity or settings-file persistence.

### Grimmory and BookOrbit settings save readback

Reader Delivery now confirms the normalized service URLs, usernames, preferred
provider, and redacted credential state against both the PUT response and a
fresh GET before clearing credential intent or reporting success. Stale
readback preserves the administrator's edits and offers a localized retryable
error in English, French, and Arabic.

Eight existing browser cases pass across desktop, iPhone, Android, and tablet;
four additional French and Arabic desktop/phone cases pass. Desktop and iPhone
failure-state captures show the edited preference and retry control in view.
Fixtures do not verify live Grimmory or BookOrbit connectivity or persisted
settings files.

### Managed user profile save readback

Lumen's administrator-managed user profile editor now checks the saved
username/email in both the successful POST response and a fresh GET before it
shows success. If the write response and persisted readback disagree, it keeps
the user's draft and shows the existing recoverable save error so the action can
be retried. This check remains within SeerrNG's existing user-management
authorization and profile route.

The focused failure/retry workflow and existing username/email regressions pass
on desktop, iPhone, Android, and tablet (12 cases). Browser fixtures simulate a
successful write response with stale persisted data, then a successful retry
with matching readback. Live account persistence and matched baseline/candidate
visual comparison remain unverified.

### Soulseek and ReadMeABook settings save readback

Lumen now verifies Soulseek and ReadMeABook connection settings in both the
successful PUT response and a fresh GET before clearing edits, credential
removal intent, or reporting success. A stale readback keeps the current draft
and key-removal choice retryable. API keys remain write-only.

The two existing browser workflows pass across desktop, iPhone, Android, and
tablet (24 cases), including a successful PUT followed by stale readback and a
successful retry. French and Arabic page checks retain their expected labels and
fit within the viewport. Desktop retry-state captures were inspected. Fixtures
do not verify live provider connectivity or persisted settings files. Evidence:
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-settings-readback-20261122/request-service/`.

### Tunerr settings save readback

The Lumen Tunerr editor now verifies normalized connection settings and the
redacted password-configured state in both the PUT response and a fresh GET.
When readback is stale, edits and password intent remain available for retry.

The settings and partial-connectivity workflow passes on desktop, iPhone,
Android, and tablet (12 cases), including stale readback followed by a verified
retry. The desktop failure capture was inspected; the changed guide window and
retry action remain visible. Fixtures do not verify live Tunerr/Sportarr
connectivity or persisted settings files. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-settings-readback-20261122/tunerr/`.

### Software acquisition settings save readback

The Lumen software acquisition editor now confirms both provider connections,
API-key configured state, Steam key state, catalog selection, emulator system
groups, and IGDB platform mappings in the successful PUT response and a fresh
GET. A mismatch retains the current edits and exposes a localized retryable
error; secret values remain write-only.

The provider test, rejected-save, stale-readback, retry, and mapping workflow
passes on desktop, iPhone, Android, and tablet (12 cases). French and Arabic
labels remain visible and the page has no horizontal overflow. Fixture behavior
does not establish live ROMarrNG/QuestarrNG connectivity or persistence.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-settings-readback-20261122/software-acquisition/`.

### Notification settings save readback

Lumen's notification channel forms now verify the saved enabled state, event
mask, public options, and configured-secret projections against both the save
response and a fresh GET. Webhook header values are checked as redacted secrets,
and its JSON payload editor retains its existing local draft behavior. A
mismatch keeps the edits and displays the existing retryable error.

All 28 notification browser cases pass across desktop, iPhone, Android, and
tablet, including rejected and stale saves, secret preservation, messaging and
server channels, Discord/Slack actions, and webhook header handling. The email
retry-state capture was inspected. Mocks do not verify live delivery or
filesystem persistence. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-settings-readback-20261122/notifications/`.

#### Redacted SMTP notification readback

The notification readback check also handles SeerrNG's redacted SMTP host and
username fields. The email fixture now edits both values and verifies the
redacted response/readback projection while keeping password values write-only.
The focused email workflow and all 28 notification browser cases pass across
desktop, iPhone, Android, and tablet.

### Streaming subscription settings persisted readback

Lumen now verifies a user's streaming-provider subscription selection in a
fresh read of the same account settings after the write response. A stale
readback leaves the selected providers editable and offers a retryable error;
the saved state advances only after both responses match.

The focused stale-readback and retry workflow passes on desktop, iPhone,
Android, and tablet (4 cases). Fixture results do not verify live account
settings persistence.

### Metadata credential settings persisted readback

Lumen's metadata credential editor now verifies the configured or removed
credential state in a fresh settings read after saving. Secret values remain
write-only; if the persisted configured state is stale, the draft and removal
intent remain available for retry.

The focused stale-readback and retry workflow passes on desktop, iPhone,
Android, and tablet (4 cases). Fixture results do not verify live metadata
provider connectivity or persisted settings files.

### Automatic blocklist settings persisted readback

The Automatic Blocklist editor now localizes its heading, controls, validation
guidance, loading and error states, and save feedback in English, French, and
Arabic. It confirms changed keyword, genre, and page limit settings in a fresh
read after the write response. If storage is stale, the validated draft remains
editable and save can be retried.

The localized blocklist workflow covers a rejected write, stale persisted
readback, and successful retry in English, French, and Arabic across desktop,
iPhone, Android, and tablet (12 standalone and 12 isolated Express `/lumen/`
cases). Matched French baseline and candidate captures at 1440 and 390 CSS
pixels show unchanged control geometry;
the shorter region-save label removes the existing phone overflow. The
reference was the French `/admin/discovery` render built from `a6d9374db`; the
candidate is the current standalone Lumen build. French and Arabic no-overflow
checks pass. Fixture results do not establish live database
persistence. Full production-server `/lumen/` acceptance remains open. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-blocklist-20261122/`.

Discovery Region settings now also verify every edited field in a fresh
`/settings/main` read before clearing the draft or invalidating public settings.
A stale readback keeps the selected region, language, and visibility changes
retryable. Browser coverage combines rejected-write, stale-readback, and retry
states across desktop, iPhone, Android, and tablet in standalone and isolated
Express-mounted builds. The shared settings localization suite also passes in
English, French, and Arabic across all four viewports in both deployments.
These fixtures do not prove live server persistence.

### Music request dialog parity (2026-11-23)

Music requests now open Lumen's request sheet before submission. It preserves
the selected MP3/FLAC Lidarr destination and, for authorized users, offers the
destination profile, metadata profile, root folder, tags, and request-on-behalf
controls. It shows the selected service and destination status, checks the
selected requester's music quota, blocks restricted requests and failed quota lookups, and returns native-compatible failure
feedback when Lidarr rejects the request. The sheet includes album identity,
artist/type/track-count facts, the full album track list, and a scrollable mobile
layout. Changing destination rechecks format availability and pending requests
against that destination, preventing duplicate requests. Request payload,
permissions, and format-specific availability checks are preserved.

The focused Music request and shared detail-options suites pass 60 cases across
desktop, iPhone, Android, and tablet. TypeScript and the Lumen production build
pass. Matched native/Lumen request-sheet captures at desktop and phone sizes are
retained in `/mnt/disks/scratch/task-deliverables/seerrng-lumen-music-visual-20261123/`.
At phone widths, the album facts panel switches to two columns so its values
remain readable; the sheet still scrolls to advanced controls. Browser fixtures
check its bounds and overflow. Live quota/provider behavior and live submission
remain unverified. This closes the request-dialog workflow gap, not all Music or
Lumen parity gaps.

### Account and administration locale fallback gaps (2026-11-23)

A static-key audit found five live Lumen labels that relied on English fallback:
account loading and selected-count feedback, the Metadata page's return label,
the Request Defaults destination, and the private game library heading. It also
found untranslated helper copy, a loading state, and credential labels on the
Metadata administration page. English, French, and Arabic overrides are now
catalogued and generated for those strings. i18n regression checks reject
English fallback for each added French and Arabic value.

Thirty-two focused browser cases pass against the candidate production build
across desktop, iPhone, Android, and tablet: Metadata administration and
credential fields, independent metadata saves and provider failures,
streaming-provider selection feedback, and the private game library region.
French and Arabic Metadata captures were inspected on desktop
and phone; an English-fallback baseline and French candidate match at 1440 by
900 pixels with the same layout geometry. The Arabic screens follow RTL and
the four-viewport checks report no horizontal overflow. The new locale labels
do not change routes, settings payloads, or library behavior. Live metadata
provider calls and independent language review remain unverified. Evidence is
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-locale-gaps-20261123/`.

### Standalone image packaging and route ownership (2026-11-23)

The full Lumen proxy suite exposed a release-path defect: the standalone image
was built with `lumen/` as its context even though the app imports shared
locale, asset, and utility sources from the SeerrNG repository. The Dockerfile,
release workflow, Compose build examples, local build instructions, and
production-image proxy test now use the repository root and copy only the
required shared sources. The production image builds, runs unprivileged, and
passes its Nginx proxy and settings-storage checks.

The same suite found that a generic Nginx redirect sent `/discover`, `/users`,
`/profile`, and `/settings` paths to the companion even where Lumen owns those
routes. Removing that catchall leaves explicit legacy bookmark mappings in
place and allows implemented Lumen routes to reach its SPA. All 58 Lumen unit,
runtime, and production-image proxy tests pass, including the route ownership
assertion. This does not complete the broader route-by-route native/Lumen
comparison or establish live companion deployments.

### Administration shortcuts and browser-suite fixture recovery (2026-11-23)

The broader browser run found that French and Arabic searches could not find
Default User Permissions or Default User Categories because these shortcut
labels had no localized destination keys. They now use localized labels. The
permissions shortcut also pointed to General Settings after the editor had
moved to Request Defaults; it now links to `/admin/requests` with the existing
anchor. The Requests list now matches the existing history label's “Over
Quota” casing.

The initial browser run also exposed stale test assumptions: the primary
navigation's accessible name is “Main navigation”; Games requires an enabled
ROM/Questarr category fixture; the TV row test's route mock missed query
strings; and its expected failure copy belonged to an older implementation.
The fixtures now model those current contracts. The focused verification passes
32 cases on desktop, iPhone, Android, and tablet. French and Arabic
Administration search captures were inspected at desktop size and RTL layout;
the result row follows existing geometry. The full Lumen browser matrix was
started but stopped after 555 cases (5 skips and 4,223 not run) because 16-way
parallel execution produced timeouts; no full-suite pass is claimed. Live
settings persistence and independent linguistic review remain unverified.

### My Media narrow-screen import control (2026-11-23)

The rendered `/library` page exposed clipping in the French personal
title-match import control on iPhone width. Its 390 CSS-pixel viewport placed
the label's right edge at 450px. The label now opts into Lumen's shared
`.btn[data-label-wrap]` behavior. A browser assertion checks the control bounds
and document width against the viewport.

French and Arabic My Media localization/recovery workflows pass across desktop,
iPhone, Android, and tablet (16 cases); the complete My Media workflow suite
also passed 44 cases immediately before this styling repair. Matched French
and Arabic before-and-after captures at desktop and iPhone sizes are in
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-locale-gaps-20261123/my-media-audit/`
and `.../my-media-audit-wrap-fix/`. The French phone control wraps onto two
lines inside its button after the fix; desktop and Arabic geometry remains
stable. Fixture results do not prove live tracking-provider connectivity.

### Large-series episode request recovery (2026-11-23)

A new 15-season Lumen browser regression models failure of the first five-season
batch, confirms later seasons remain selectable, retries only the missing first
batch, and checks that selections made before retry remain in the final request.
The exact request succeeds in standalone and bundled `/lumen/` builds across
desktop, iPhone, Android, and tablet (8 browser cases). The server's TV route
suite also passes its 15-season concurrent-provider recovery case (6 tests in
the file). These provider fixtures and route mocks verify batching and recovery
contracts, not live metadata-provider availability or latency.

### Series selection labels and navigation test contracts (2026-11-23)

For whole-series selection, the shortcut is labeled “Select entire series” and
the submit action remains “Request entire series.” This separates selection
from submission in the control names and prevents duplicate accessible button
names when every season is available. English, French, and Arabic labels are
covered; the fifteen-season browser case verifies selection preservation and
the resulting whole-series request payload. Navigation browser fixtures use
the shell's current “Main navigation” accessible name; this repairs stale test
selectors without changing rendered navigation. A stale TV request-summary
assertion was also corrected to match the current requester/date separator.
Validation: production build; 76 TV-request browser cases and the focused locale
catalog tests passed; the affected navigation and administration cases are
included in the final 560-case run across desktop, iPhone, Android, and tablet.
Matched visual captures for the selected 15-season desktop and phone states are
retained in `/mnt/disks/scratch/task-deliverables/seerrng-lumen-locale-gaps-20261123/`.

### Native Issues comparison reopened (2026-11-23)

The native comparison harness now signs in to the isolated E2E instance and
supplies a complete TV media fixture. The initial Oops was caused by the fixture
omitting native user-avatar and media data; this was test setup, not a Lumen
runtime failure. Native `/issues` list and inline expanded detail both render
at desktop and iPhone sizes, and the standalone Lumen issue permission suite
passes the focused permission and episode-lookup cases across desktop, iPhone,
Android, and tablet.

The matched screenshots exposed remaining parity work: native list rows show
more media facts and use a different filter arrangement. Lumen now supports
inline expansion as well as its direct detail route. The captured episode
lookup reports a failure because the isolated run has no live TMDB season data;
fixture coverage now verifies mapped titles and retry behavior, while live
provider-backed metadata remains unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-locale-gaps-20261123/issues-native/`
and `.../issues-lumen/`.

Lumen's Issues rows now include selected TV season and episode numbers using
the existing localized season/episode labels. The complete issue browser suite
passes 44 cases across desktop, iPhone, Android, and tablet, and the production
build passes. A native/candidate review confirms the affected-season context is now
available directly in the Lumen list. Row media facts, filter grouping, and
inline discussion are implemented; live season-provider responses and the
remaining native visual matrix remain open. Candidate captures are retained in
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-locale-gaps-20261123/issues-lumen/candidate/`.

### Affected TV episode names in issue discussions (2026-11-23)

Lumen now resolves each selected TV season through SeerrNG's authenticated
season endpoint and displays the selected episode numbers with their names.
Legacy reports that represent an entire series retain the native all-seasons
label. Loading, empty, and retryable provider-error states are visible, and the
episode rows use compact existing Lumen summary styling. English, French, and
Arabic labels are included.

The issue-detail browser fixture verifies exact season and episode mapping,
excludes unselected episode records, and exercises a failed season request and
successful retry. All 12 focused cases pass across desktop, iPhone, Android,
and tablet. The Lumen production build passes. Desktop and phone captures were
inspected at matching issue detail states; live TMDB season responses remain
unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-locale-gaps-20261123/issues-lumen/episode-candidate/`.

### Scheduled job names use the native locale catalog (2026-11-23)

Lumen now resolves each scheduled job's display name through the same localized
message key as native SeerrNG, using the stable job ID. Raw API names remain a
fallback for future or unknown job IDs. The existing schedule editing, save
retry, confirmation, and job actions are unchanged. The catalog generator now
includes every current server `JobId` message key. The Lumen page also displays
the native explanation that manually running a job does not alter its schedule.

The existing Scheduled Jobs browser workflow verifies localized job names,
the job guidance, frequency selection, retained edits after a rejected write,
successful retry, and unchanged schedule payload in English, French, and Arabic. All 24 browser
cases pass: desktop, iPhone, Android, and tablet in both the standalone app and
the production SeerrNG `/lumen/` mount. The production Lumen bundle and the
repository localization check also pass. French desktop and iPhone candidate
screenshots are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-locale-gaps-20261123/jobs-captures/`
and were inspected. The historical native `/settings/jobs` captures were also
reviewed. A matched populated comparison now uses the same Plex scan job and
schedule at desktop and phone sizes. Lumen keeps the job name, state, next run,
cron value, and all three actions visible on phones. The native combined
Jobs & Cache page clips its table columns and actions at that width; the Lumen
job card remains readable and links to a separate System Caches screen. Captures
are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-indexer-state-guidance-20261123/native-jobs/`
and `.../lumen-jobs/`.

### Matched Music discovery visual check (2026-11-23)

The native and Lumen Music discovery pages were rendered with the same populated
album fixture at 1440×900 desktop and 390×844 phone sizes. Both cases passed and
reported no horizontal overflow. The Lumen candidate retains search, request
history, playlist import, sorting, release-type filters, and the album result;
its poster uses the existing square-art role, matching the square MusicBrainz
cover asset. On the phone capture, the album artwork and metadata remain above
Lumen's fixed navigation. The native full-page capture places its fixed tab bar
over the lower part of the portrait-cropped album poster. This comparison checks
Music discovery only; album detail and other media detail routes still need their
own matched-state review. Native and candidate captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-music-visual-parity-20261123/music-discovery-refresh/`.

### Mobile detail action-bar clearance (2026-11-23)

A phone-width Music album capture showed the fixed request bar covering the
bottom of the album facts card. At maximum scroll, the card extended about 20
CSS pixels below the bar's top edge. The previous `.view` bottom padding used a
fixed value that could not account for localized and multi-control action bars.
Lumen now measures the active action bar, reserves its rendered height plus a
24-pixel content gap, and recalculates when a route, viewport, or bar size
changes. The measured bar height already includes its device safe-area inset.
The shared `.view` owner applies this to Music,
movie, TV, book, game, comic, and sports detail bars without changing desktop
geometry.

Regression checks scroll to the bottom of Music and TV details and verify that
the facts card or detail content ends above the bar and that reserved clearance
is at least the measured bar height. Sixteen standalone browser cases pass for
Music and TV details across desktop, iPhone, Android, and tablet; the bundled
`/lumen/` Music route passes desktop and phone integration cases. The Lumen
production build passes. Before/after phone captures and desktop review are
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-music-artists-20261123/`.
Other action-bar consumers still need route-specific visual review.

### Rich issue list cards (2026-11-23)

The native issue list showed substantially more context per row than Lumen.
Lumen issue cards now present the media title and poster, media format, localized
release or publication date and runtime/pages/issues, issue creator and date,
description, type, affected TV seasons and episodes, status, direct issue
details, and the existing inline discussion action. Creator identity is hidden
unless the viewer has native-compatible VIEW or MANAGE Issues permission. Missing
poster assets use SeerrNG's bundled fallback; unavailable media metadata leaves
the report and its actions visible.

The affected standalone browser suite passes 52 cases across desktop, iPhone,
Android, and tablet, including English/French/Arabic labels, creator permission
boundaries, discussion state, and mobile action clearance. Two more browser
cases pass against the bundled `/lumen/` Express mount at desktop and phone
sizes. The standalone and embedded production Lumen builds, Prettier, ESLint,
and `git diff --check` pass. Existing native and candidate
list captures were reviewed at desktop and phone widths; the screenshots use
different media metadata fixtures, so they establish the missing card content
and responsive structure rather than pixel equality. Live provider metadata and
independent translation review remain unverified. Candidate captures are
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-issue-card-parity-20261123/`;
the native comparison is under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-locale-gaps-20261123/issues-native/captures/`.

### Availability notifications on movie and TV details (2026-11-23)

Movie and TV detail pages now expose the native availability-notification
action. The control reads the signed-in user's subscription state from
SeerrNG's existing self-scoped endpoint, appears only when the server says the
viewer can subscribe or is already subscribed, and uses the existing POST and
DELETE mutations. A stale request conflict refreshes server state and reports
that the other user's request ended. The server remains responsible for
subscription eligibility, scope, ownership, rate limits, and persistence.

The focused browser suite verifies add/remove mutations for movie and TV,
omission when the server says no other request can be followed, and visibility
at desktop, iPhone, Android, and tablet sizes (12 cases). The Lumen production
build passes. English, French, and Arabic action and feedback messages are
provided. Candidate phone and desktop captures show the control in the existing
detail action row. The retained native movie reference does not contain an
eligible other-user request, so matched-state visual comparison and live
subscription persistence remain unverified.

Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/`.

### Linked media-server collections on TV details (2026-11-23)

When Plex, Jellyfin, or Emby is configured, Lumen TV details now read the
signed-in user's accessible collections for the selected HD/4K series and
allow adding or removing that whole series from an existing collection. The
control never creates or deletes collections. It validates the complete
bounded server response, rereads membership before acting, preserves the
chosen add/remove intent if another client changed membership, and displays
success only after the server confirms the requested membership. Unavailable,
unlinked, unauthorized, missing-series, oversized, empty, and failed states
remain explicit. Server-side account, scope, provider, and collection
authorization remain authoritative.

Eight standalone browser cases cover add/remove and the no-partial-list limit
state across desktop, iPhone, Android, and tablet. Two bundled `/lumen/`
cases verify the real production bundle at desktop and phone widths. The
standalone TypeScript/build and bundled production build pass. Candidate
phone and desktop captures were inspected; the existing SeerrNG TV control is
a provider-branded dropdown in its playback action row, while Lumen uses its
existing detail disclosure and chip owners. A state-matched native screenshot
with a configured collection provider is not available, so comparative visual
acceptance and live provider round trips remain unverified.

Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/`.

### Episode Queue default on TV details (2026-11-23)

Lumen TV details now display the signed-in user's Episode Queue default, matching
SeerrNG's read-only detail indicator for off, one episode, or multiple episodes.
The value comes from the existing self-scoped settings endpoint; signed-out
viewers do not make the request. The detail badge does not mutate user settings.
English, French, and Arabic labels are provided.

Four focused browser cases cover off, singular, plural, and signed-out behavior.
A state-matched native TV screenshot and translated visual review remain
unverified. The desktop and phone candidates are retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/episode-queue/`.

### Playback options on movie details (2026-11-23)

Lumen movie details now expose SeerrNG's active-device and media-server playlist
playback actions for users who may request movies and have a playable copy. The
sheet reads the existing playback catalog and authorized devices, then uses the
existing authenticated playback and playlist routes with the selected media ID,
item ID, and quality. SeerrNG remains authoritative for linked-account,
provider, and playback permission checks. 4K options require the global 4K
switch, the viewer's 4K permission, and visible available 4K media.

Twenty browser cases cover HD and 4K playback on a selected device, creating and
opening server playlists, and withholding controls without movie permission,
4K permission, or the global 4K switch across desktop, iPhone, Android, and
tablet. The production Lumen build passes. Desktop
and phone candidate captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/movie-playback/`.
No state-matched native capture with playback devices is available, so visual
comparison and live provider playback remain unverified.

### Episode playback options on TV details (2026-11-23)

Lumen TV details now expose the authenticated playback sheet for signed-in
viewers with TV request permission when the series has playable media. It lists
only available seasons the viewer may access, lets viewers select individual
episodes or whole seasons, and submits only those item IDs to the existing
device-play or playlist route. Shared-only seasons are omitted using the same
viewer availability projection as the detail page; SeerrNG still enforces the
viewer, linked account, provider, and playback permissions server-side.

The four-project browser fixture verifies that a shared-only season is hidden,
an individual episode can be excluded, and playback sends only the remaining
episode ID. Desktop, iPhone, Android, and tablet cases pass. A state-matched
native TV capture with a linked playback device and live provider playback
remain unverified. Candidate UI evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/tv-playback/`.

### Direct Discover destinations in Lumen navigation (2026-11-23)

The shared Lumen desktop and mobile menu now exposes Book Recommendations,
Collector Picks, Software, and Translations & Hacks as direct destinations,
alongside Game Finder. Book Recommendations, Collector Picks, Game Finder, and
Translations & Hacks follow SeerrNG request permission and enabled media
categories; Software follows enabled game categories and provider availability
so browse-only users retain catalog access. Book Recommendations selects
Audiobooks when Ebooks are turned off. The Patches menu item reuses SeerrNG's
localized `components.Layout.Sidebar.patches` message rather than introducing a
Lumen-only label. This supplements existing in-page shortcuts and keeps route
checks authoritative.

Browser fixtures cover all five menu destinations, unavailable request
permission while preserving Software browsing without request permission,
account category restrictions, the audiobook-only route, and menu scrolling at
desktop, iPhone, Android, and tablet sizes. The 20-case destination suite passes
against both the standalone production build and the generated embedded
`/lumen/` production bundle. The browse-only menu was inspected on desktop and
iPhone; the added link uses the existing navigation owner and preserves the
drawer and phone-tab layout. Candidate screenshots and Playwright traces are
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/software-browse/`
and
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/navigation-discover/`.

Parity review found that Lumen labeled the Patches sidebar destination “Browse
Patches,” while the native menu calls it “Translations & Hacks.” The Lumen
sidebar now uses the native localized message key; its separate page-level
“Browse Patches” action remains unchanged. The request-entry browser test scopes
queries to the navigation landmark, distinguishing the menu destination from
in-page shortcuts. Sixty request-entry checks pass across desktop, iPhone,
Android, and tablet for viewer, requester, and admin permissions; the broader
navigation suite passes 208 checks with 8 project-specific skips. Baseline and
candidate desktop and iPhone menu captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-navigation-label-parity-20261123/`.

### Persisted Issues filter disclosures (2026-11-23)

The native Issues page lets each user pin Task Filters, Media Filters, Filters,
and Sort By open for their selected media scope. Lumen previously used temporary
`details` state and lost those choices after navigation or reload. Its four
disclosures now use SeerrNG's authenticated detail-disclosure settings route,
verify the saved response, refresh the signed-in settings, and show retryable
feedback after a failed save. Scope follows the native behavior: TV, music, and
book filters use their respective settings; all, movie, comic, and magazine use
movie settings.

The focused standalone browser cases pass on desktop, iPhone, Android, and
tablet; the built embedded `/lumen/` bundle also passes the persistence case on
desktop and iPhone. They
verify failed-save feedback, retry, the saved response, and restored pinned
state after reload. The production build passes. Desktop and iPhone captures of
the pinned Media Filters state were inspected; no stylesheet or shared layout
owner changed. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/issue-pinned/`.

### Direct user management navigation (2026-11-23)

Lumen navigation now links administrators and delegated user managers directly
to User Management, matching native access while keeping the regular-user menu
free of management actions. The destination remains guarded by the existing
administrator or `MANAGE_USERS` route check.

Four-project browser fixtures verify direct access for both authorized roles
and hide the link for standard users.

### Scheduled job save confirmation (2026-11-23)

The Lumen Scheduled Jobs editor now verifies the saved cron schedule through a
fresh `/settings/jobs` read before closing. If the write endpoint accepts the
save but the returned list does not contain the requested schedule, the page
keeps the edited cron value visible, reports that confirmation failed, and
allows a retry. Successful confirmation reports a localized saved state.

Eight browser cases pass across English, French, and Arabic and desktop, iPhone,
Android, and tablet. A dedicated fixture returns a stale schedule after an
accepted write, then verifies the editor remains retryable and closes only
after the next read confirms the saved value. Build and i18n checks pass;
catalog review still reports the repository's existing untranslated and
unreviewed entries. Error and success captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/admin-jobs/visual/`.

### Persistent TV overview disclosure (2026-11-23)

Native SeerrNG lets a user collapse the TV overview and pin it open through
`detailDisclosurePins.tv.overview`. Lumen previously rendered the overview as
permanent text. TV details now use the existing Lumen disclosure component and
authenticated `detail-disclosures/tv` settings endpoint, including response
confirmation, user-settings refresh, and retryable save errors. The control and
preference label are localized in English, French, and Arabic; no stylesheet or
shared layout owner changed.

The regression extends the existing TV credit-pin fixture and verifies the
overview's collapsed default, saved preference, and restored open state after
reload. It passes in desktop, iPhone, Android, and tablet Playwright projects.
The Lumen production build and repository i18n check pass; the latter continues
to report the existing untranslated/unreviewed catalog backlog. Baseline
`9273c3593` and the candidate were rendered with the same API fixture at
1440×900 and iPhone 13 viewport sizes. Desktop and phone captures were inspected
for collapsed and expanded states; the overview remains in the information
column with no clipping or horizontal overflow. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/tv-overview-visual/`.

This closes only TV overview disclosure parity. Other movie detail disclosures,
book/music detail panels, TV facts and media-server panels, broader route-level
visual acceptance, and live provider verification remain open in the overall
Lumen parity initiative.

### Persistent music Subject Tags disclosure (2026-11-23)

Native album details combine release-group and artist tags, deduplicate them
case-insensitively, sort by descending count, and expose up to 50 tags in a
pinnable panel. Lumen now matches that behavior on album pages. Each tag opens
Music discovery with its genre filter; the existing header preview still shows
the four highest-ranked tags. The panel uses the shared authenticated
`detail-disclosures/music` settings route and provides the existing localized
empty state when no tags are available.

The browser regression covers merging, case-insensitive deduplication, link
targets, and pin/save/reload/unpin behavior. Desktop, iPhone, Android, and tablet
projects pass; the phone project also checks for horizontal overflow.
Production build passes. Baseline `d65572698` and candidate captures use the
same album fixture at desktop 1440×900 and iPhone 390×844. Closed and expanded
states were inspected at both sizes. The layout retains the shared disclosure
surface without horizontal overflow. The fixture's unrelated Lidarr settings
error appears in both captures and is excluded from this change. Evidence is
retained at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/music-subject-tags-visual/`.

Other music detail gaps, book collection and subject-tag pin behavior, TV facts
and media-server panels, collection disclosures, broader route-level visual
acceptance, and live provider verification remain open in the overall Lumen
parity initiative.

### Persistent movie facts disclosure (2026-11-23)

Native movie details expose a separately collapsible and pinnable Details
panel. Lumen previously rendered all movie Facts rows continuously in the
right-hand column. The existing facts block now uses the shared Lumen video
disclosure and the authenticated `detail-disclosures/movie` settings route;
all fact rows, links, provider availability values, and data filtering remain
unchanged. The control and saved-preference label are localized in English,
French, and Arabic. No CSS or shared layout owner changed.

The existing detail-pin browser fixture verifies the closed default, expanded
facts, saved pin response, and restored open state after reload. It passes in
desktop, iPhone, Android, and tablet projects. The Lumen production build passes.
Baseline `cc4412be7` and candidate captures use the same series/movie fixture at
1440×900 and iPhone 13 sizes. Collapsed and expanded candidate states were
inspected at both sizes; the information stays in the existing facts column and
the phone layout remains scrollable without horizontal overflow. Evidence is
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/movie-details-visual/`.

This closes only movie facts disclosure parity. Other movie detail disclosures,
book and music detail panels, TV facts and media-server panels, collection
disclosures, broader route-level visual acceptance, and live provider
verification remain open in the overall Lumen parity initiative.

### Persistent book details disclosure (2026-11-23)

Native book details expose a per-user Details disclosure. Lumen previously
rendered book facts continuously. The facts now use the shared disclosure
component and authenticated `detail-disclosures/book` settings route, with
server response confirmation and user-settings refresh. The disclosure and
saved-preference labels are localized in English, French, and Arabic. Fact
content and its links are unchanged; no CSS owner changed.

The detail-pin browser fixture verifies the closed default, expansion, saved
pin, and restored open state after reload across desktop, iPhone, Android, and
tablet (4 passes). The production build passes. Baseline `9115eb8fb` and
candidate captures use the same fixture at 1440×900 and 390×844; collapsed
baseline/candidate and expanded candidate states were inspected. The phone
panel stays in the existing information column and the page remains vertically
scrollable without horizontal overflow. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/book-detail-visual/`.

This closes only book Details disclosure parity. Book collection and subject-tag
pin behavior, other book panels, music detail disclosures, TV facts and
media-server panels, collection disclosures, broader route-level visual
acceptance, and live provider verification remain open in the overall Lumen
parity initiative.

### Persistent music album Details disclosure (2026-11-23)

Native music album details expose a per-user Details disclosure. Lumen previously
rendered the album Facts table continuously. It now uses the shared disclosure
component and authenticated `detail-disclosures/music` settings route, with
response confirmation and user-settings refresh. Album Details and its saved
preference label are localized in English, French, and Arabic. The facts,
artist link, and request actions are unchanged; no CSS owner changed.

The browser regression verifies the closed default, expansion, saved pin, and
open state after reload across desktop, iPhone, Android, and tablet (4 passes).
The production build passes. Baseline `1fa2bf82c` and candidate captures use the
same fixture at 1440×900 and 390×844. Collapsed and expanded candidate states
were inspected at both sizes; the facts remain in the existing information
column, and the phone layout has no horizontal overflow. Evidence is retained
at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/music-details-visual/`.

This closes only the music album Details disclosure. The artist and subject-tag
pin roles, other music detail gaps, book collection and subject-tag pin behavior,
TV facts and media-server panels, collection disclosures, broader route-level
visual acceptance, and live provider verification remain open in the overall
Lumen parity initiative.

### Persistent music Artists disclosure (2026-11-23)

Native music details let users pin the contributing Artists panel open. Lumen's
existing View Artists disclosure now uses the shared component and authenticated
`detail-disclosures/music` settings route. It retains unique album and track
artist links and their role labels. The saved preference uses localized English,
French, and Arabic copy; no CSS or contributor-selection behavior changed.

The regression passes in desktop, iPhone, Android, and tablet projects. It
checks that pinning opens the panel after reload and unpinning closes it, leaves
the preference false, and restores the closed state after another reload. The
production build passes. Baseline `a2780a71f` and candidate captures use the
same album fixture at 1440×900 and 390×844. Closed and expanded states were
inspected at both sizes; artist links and the pin action remain within the
existing disclosure surface, with no phone horizontal overflow. Evidence is
retained at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/music-artists-visual/`.

This closes only the music Artists pin role. Music subject-tag pin behavior,
other music detail gaps, book collection and subject-tag pin behavior, TV facts
and media-server panels, collection disclosures, broader route-level visual
acceptance, and live provider verification remain open in the overall Lumen
parity initiative.

### Book collection and subject disclosures

Lumen book details now expose persistent Collection and Subjects disclosures.
Collection summaries load lazily on open, show the series description and book
count, and link up to three related subjects; the Subjects panel links the
book's subject tags into filtered Books discovery. Both panels use the shared
video disclosure control and the user's scoped detail-disclosure preference.
The server settings contract now accepts the Collection pin for both movie and
book details, correcting the earlier movie-only validation that silently
rejected book collection saves. OpenAPI now documents the supported movie/book
scope.

The focused user-settings API case passes, the Lumen production build passes,
and the browser workflow passes across desktop, iPhone, Android, and tablet. It
checks lazy series-summary fetching, filtered links, save/readback/reload and
unpin behavior, and phone overflow. Matched 1440px desktop and 390px phone
baseline/candidate captures were inspected in closed and expanded states; the
new panels follow existing disclosure surfaces and the request action remains
available. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/book-detail-visual/`.
The fixture verifies the application contract but does not establish live
provider availability or independent translation review.

### TV series facts disclosure

The native TV detail layout exposes its metadata facts as a controllable Details
panel. Lumen previously rendered those facts continuously and offered no saved
open/closed state. The TV facts now sit in a persistent Series Details panel,
using the existing TV-scoped preference endpoint and shared disclosure control.
The label and preference feedback are localized in English, French, and Arabic;
TV overview, cast, crew, and subject-tag disclosures retain their separate
preferences.

The existing browser workflow now verifies the collapsed default, facts on
open, scoped save and reload, and the unchanged overview/credit preferences. It
passes on desktop, iPhone, Android, and tablet. Matched baseline/candidate
captures were inspected at 1440px and 390px, including open state; the fixed
request action and mobile navigation remain clear. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/tv-detail-visual/`.

### Movie collection disclosure

Movie details now include a persistent Collection disclosure when the metadata
contains a collection. The collection endpoint is fetched only after opening
or pinning the panel; the summary shows its description, collection size, and a
link to the full collection workflow. The existing movie-scoped preference
persists the pin, independent of cast, crew, subject tags, and movie facts.
Load failures provide an explicit retry action.

The browser workflow checks that the collection endpoint stays untouched while
the panel is collapsed, verifies the summary and destination link on open, then
saves, reloads, unpins, and verifies the collapsed state. It passes on desktop,
iPhone, Android, and tablet. Matched 1440px desktop and 390px phone captures
were inspected in closed/open states; no horizontal overflow or fixed-action
obstruction was observed. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/movie-collection-visual/`.

### TV media-server actions disclosure (2026-11-23)

TV playback options, saved-item state, and media-server collections now live in
a persistent Media Server disclosure instead of occupying the always-visible
action row. The disclosure appears only when the configured media server is
Plex, Jellyfin, or Emby; it keeps the existing action components, server API
contracts, request permission checks, and TV-scoped saved preference. Opening
collections remains a separate lazy disclosure inside the panel.

The browser workflow verifies the closed state, Jellyfin favorite and collection
actions, nested collection disclosure, save/readback/reload, and unpin behavior.
It passes on desktop, iPhone, Android, and tablet. Matched baseline/candidate
captures were inspected at desktop and phone sizes, with the surrounding detail
panels and fixed mobile request/navigation controls visible. Evidence is
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/tv-media-server-visual/`.
These fixtures verify the client contract; live Plex/Jellyfin/Emby account
behavior still requires provider-backed verification.

### Open issue reports on comic details (2026-11-23)

Native comic details surface open issue reports to users with issue-reading
permission. Lumen's comic detail previously offered issue reporting but omitted
existing open reports. It now shows the open reports associated with the
selected edition's SeerrNG media record, only for users allowed to read issues,
and links each report to Lumen's existing issue detail and discussion workflow.
Resolved reports are omitted. The rendering reuses the existing Lumen detail
section and list styles; no issue permission or API contract changed.

The browser check verifies denial for a regular viewer, visibility for an issue
reader, direct issue-detail links, and exclusion of resolved reports. It passes
on desktop, iPhone, Android, and tablet. Matched baseline/candidate captures
were inspected at desktop and phone sizes. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/comic-open-issues-visual/`.
The fixture validates permission and display behavior; a live issue-reader
account and persisted provider data remain unverified.

### Open issue reports on magazine details (2026-11-23)

Native magazine details also show open issue reports to issue readers. Lumen's
magazine detail now shows the open reports associated with its SeerrNG media
record, using the same permission boundary, localized issue type labels, and
direct Lumen issue-detail links as comic details. Resolved reports are omitted.

The browser check verifies denied and authorized viewers, the report link and
description, and exclusion of resolved reports. It passes on desktop, iPhone,
Android, and tablet. Matched desktop and phone baseline/candidate captures were
inspected; the new list uses the existing detail row style and keeps the fixed
request action visible. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/magazine-open-issues-visual/`.
Live account and provider-backed verification remain open.

### Shared open issue reports on book and music details (2026-11-23)

Native book and music details also show open issue reports to issue readers.
Lumen now uses one shared `OpenIssueReports` component across book, music,
comic, and magazine details. It filters to open reports, applies the existing
issue-reading permission boundary, uses localized issue type labels, and links
to the existing Lumen issue detail and discussion workflow. No API or
permission behavior changed.

The browser workflow verifies that ordinary viewers do not see the reports,
issue readers see the correct report and comment on both details, and each link
opens the matching issue. It passes on desktop, iPhone, Android, and tablet.
Matched baseline/candidate desktop and iPhone views were inspected with the
report section scrolled into the actual viewport so the fixed mobile action
bar does not obscure the comparison. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/book-music-open-issues-visual/`.
The fixtures do not verify live issue-reader accounts or provider-backed data.

### TV episode availability localization (2026-11-23)

The existing per-episode availability disclosure now follows the saved Lumen
locale for its heading, season label, generated season names, loading and empty
states, provider-quality labels, shared-copy labels, missing-file states, and
load failure/retry feedback. English, French, and Arabic use the same source
availability and per-user visibility rules; provider names and episode titles
remain provider data.

Fixtures exercise delayed loading, failed reads and retry, Plex availability,
an episode with no reported file, and all three saved locales. The existing
season-switch behavior also remains covered. Eight cases pass across desktop,
iPhone, Android, and tablet. Matched English baseline/candidate captures were
inspected at desktop and phone sizes; French and Arabic candidate layouts were
also inspected at both sizes with no clipping or overflow. Evidence is retained
at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/tv-episode-availability-localization/`.
The fixture does not verify live provider data, and translations have not had
independent linguistic review.

### Open issue report metadata (2026-11-23)

Lumen's shared open-issue panels now show the media-specific issue reason,
localized creation date, and reporter alongside the existing issue type,
discussion comment, and detail link. Reason labels reuse SeerrNG's native
locale catalogs for books, comics, and magazines.
Reporter names and profile links follow SeerrNG's `VIEW_ISSUES` / `MANAGE_ISSUES`
boundary; users who can read an issue without those permissions see the native
unavailable label instead. Open/resolved filtering, API permissions, and issue
actions are unchanged.

The browser regression verifies the authorized and restricted reporter views,
open-only filtering, and direct issue links across desktop, iPhone, Android,
and tablet. The production build and four viewport captures pass; matched prior
and candidate desktop/phone captures were reviewed. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/open-issue-metadata-visual/`.

### Inline issue discussions on media details (2026-11-23)

Open reports on Lumen book, music, comic, and magazine details now expand their
existing discussion in place, matching native issue-card behavior. The panel
loads the existing permission-aware issue discussion only when expanded; its
comments, comment editing, and resolve workflow retain the issue page's API and
authorization checks. Issue deletion remains on the dedicated issue route, as
in native embedded cards. The disclosure starts collapsed and keeps the direct
issue-detail link.

The shared browser cases verify open-only display, reporter privacy, expansion,
discussion readback after adding a comment, and direct detail navigation across
desktop, iPhone, Android, and tablet. The production build keeps the issue page
in its lazy chunk; the existing Book Series import and main-bundle-size warnings
remain. Desktop and phone expanded views were inspected with the phone comment
form fully above the fixed navigation. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-availability-subscription-20261123/open-issue-discussion-visual/`.
The fixtures verify client permission and API flows; live account behavior
remains unverified.

### Large TV request transient season recovery (2026-11-23)

Lumen now retries a failed season metadata batch once after a short delay, then
continues loading later batches. A retry containing only seasons that remain
missing avoids re-fetching successful season details; completed batches remain
available for selection, and an explicit Retry still preserves the request's
selection. This brings Lumen's recovery behavior in line with the native
request tree and reduces user-visible errors caused by a transient provider or
proxy failure.

The browser regression passes for desktop, iPhone, Android, and tablet. It
injects a one-time failure into the first of three batches and verifies the
automatic recovery and selectable episode data. A persistent failure remains
visible with the existing manual retry path. The fixture validates client
behavior and does not establish the reporter's live provider latency or the
cause of the original screenshot.

### Large TV request bulk selection (2026-11-23)

Lumen's episode request sheet now has select-all and per-season select/deselect
controls for episodes the current requester can request. Ineligible episodes
remain unselected; the season disclosure stays independent from selection;
clearing and selecting controls preserve the existing request payload shape.
Controls and accessible labels are localized in English, French, and Arabic.

The large-series browser fixture verifies availability-based exclusion,
select-all, per-season deselection, selection clearing, and season selection
without opening the season, across desktop, iPhone, Android, and tablet. The
production Lumen build passes. Candidate screenshots were inspected at desktop
and iPhone sizes; matched baseline visual acceptance and live provider
submission remain unverified. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-episode-selection-parity-20261123/tv-bulk-controls/`.

### Large TV request latest-season shortcut (2026-11-23)

The episode request sheet now includes the native latest-season shortcut. It
replaces the current selection with every currently requestable episode in the
highest regular season, excluding specials and unavailable or already-requested
episodes. The shortcut stays disabled while metadata is loading or incomplete,
so it cannot mistake the latest loaded season for the latest season in the
series. English, French, and Arabic labels are included.

The large-series browser fixture verifies that latest-season selection replaces
a prior all-episodes selection and targets the highest eligible regular season.
The production build, all 58 Lumen unit and packaging tests, and all 8 large-
series browser cases across desktop, iPhone, Android, and tablet pass. Candidate
desktop and iPhone captures show the new control at its target viewports; live
provider metadata and matched native visual acceptance remain unverified.

### Media-specific issue reasons in Lumen issue rows (2026-11-23)

Lumen issue rows now show the localized reason for valid book, comic, and
magazine issue subtypes, matching the native issue card. The dedicated issue
summary also uses the localized reason text. Both surfaces validate the subtype
against the media category, so stale or cross-category API values are omitted.
Existing issue-reason translations are reused; movie and TV issue rows do not
gain a reason field.

The fixture covers a valid book reason and an invalid movie subtype in English,
French, and Arabic on desktop, iPhone, Android, and tablet (12 cases), including
the localized issue-detail summary. The complete 64-case issue workflow suite
and production Lumen build pass. English baseline and candidate issue lists were
captured at matching desktop and phone viewports and inspected; the screenshots
use the same mocked book/movie rows. The fixed mobile navigation overlays the
lower portion of full-page captures; the issue page retains the shared bottom
padding that allows scrolling below the tabs. The native comparison capture does
not expose the reason row, so native-matched reason-row visuals remain
unverified. Captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-issue-reason-parity-20261123/`.

### Search trending and loading localization (2026-11-24)

Search's “Trending this week” section title and “Searching…” status now have
French and Arabic translations instead of English fallback text. Unit coverage
rejects untranslated values, and the browser fixture verifies the rendered
trending heading, in-flight search status, empty results, and pagination in
English, French, and Arabic across desktop, iPhone, Android, and tablet (12
locale/viewport cases). Matched French and Arabic desktop and iPhone captures
were inspected; the text changes do not alter layout or navigation. The same
capture review exposed the administrator menu's untranslated User List link.
Lumen now includes SeerrNG's localized `components.Layout.Sidebar.users` key;
the browser fixture opens the mobile More menu and checks that link as well.
Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-search-localization-20261124/`.

### Quick request sheet localization

The shared movie and TV quick request sheet now localizes its accessible title,
heading, series and destination/quality hints, quota-approval explanation, and
request/cancel actions in English, French, and Arabic. It reuses SeerrNG's
existing localized message catalog for standard quality, progress, request,
error, and cancel labels, with Lumen translations for the quick-sheet wording
that has no matching native message. Arabic isolates the interpolated media
title so Latin titles retain their reading order. Request permissions, options,
quota handling, streaming-policy override, and submitted payloads are unchanged.

The focused browser cases pass for English, French, and Arabic at desktop and
iPhone sizes, exercising the streaming-policy override action and preserving
matching captures. English, French, and Arabic candidate captures were inspected;
the Arabic title remains ordered correctly. Fixtures do not verify live request
providers or server-side authorization. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-dialog-localization-20261124/`.

### Game content picker localization

The shared PC game request picker now localizes its content section, request
selection labels, add-on content status, library badges, edition completeness,
and missing-item count in English, French, and Arabic. Selection values and
submitted game request data remain unchanged.

The browser fixture checks the saved-locale request control and incomplete
edition state across desktop and iPhone in all three locales. Matching French
baseline/candidate desktop captures show the prior English fallback replaced by
French without changing picker geometry; the Arabic desktop and phone candidate
renders were inspected for direction and overflow. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-game-content-localization-20261124/`.

### Account card-title preference localization

The shared Appearance switch now uses the localized Title View label and a
French/Arabic explanation of its cross-media behavior. Save and confirmation
errors reuse the existing localized Account Settings messages. The preference
API, enabled media types, and saved values are unchanged.

The browser fixture verifies the saved-locale switch and captures matching
French and Arabic desktop/phone states. The previous English fallback and
localized candidates were inspected at the same routes and viewports; the text
fits the existing control without layout changes. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-card-title-toggle-localization-20261124/`.

### TV request editor localization

The administrator TV request editor now follows the saved English, French, or
Arabic locale for its title, requester, season labels, requested-episode counts,
loading state, and approve/save/cancel actions and completion errors. Native
SeerrNG translations are reused for common season, loading, cancel, and saving
labels. Request selection, destination controls, and update/approve/retry API
payloads are unchanged.

The new browser case verifies the French editor on desktop and iPhone; existing
English movie and TV edit/approval cases pass. The unit suite passes 59 cases and
the production build succeeds. Matched baseline and French candidate sheet
captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-request-edit-localization-20261124/`.
Live request submission and independent translation review remain unverified.

### Live TV airings localization

The movie and TV detail Live TV Airings action and sheet now follow the saved
English, French, or Arabic locale. This includes guide loading and readiness,
empty and unavailable states, season/episode and localized airing times,
recording actions, and recording success/error feedback. Existing permission
gates, lookup query, selected programme identity, and recording request payload
are unchanged.

Twelve browser cases pass across movie and TV details, all three locales, and
desktop/iPhone. They verify both movie recording requests and TV series requests,
including their request payloads and feedback. The standalone production build
succeeds. English baseline and French candidate captures were inspected at
matching desktop and iPhone viewports; the sheet structure and control geometry
remain the same. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-live-tv-localization-20261124/`.
Live tuner/provider data and recording submission remain fixture-only.

### Anime continuation localization

The shared Anime Continuation panel now follows the saved Lumen locale for its
title, source lookup controls, season selector, confidence and match-position
labels, evidence disclosure, availability notes, catalog links, and language
names. It sends the selected Lumen locale in the continuation lookup, while
keeping provider-derived titles, IDs, follow subjects, and request identities
intact. English, French, and Arabic messages are provided; Arabic position lists
use RTL punctuation.

Browser fixtures verify the selected lookup language, source result details,
season changes, catalog destinations, and the future-volume follow action. The
French candidate and English baseline were captured at matching desktop and
iPhone viewports; Arabic desktop and iPhone captures were also inspected. The
franchise title-switch regression passes on both viewports. Evidence is retained
at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-anime-continuation-localization-20261124/`.
Fixtures do not verify live AniList or RanobeDB data. The iPhone browser harness
uses forced pointer events for controls on this long detail page because other
detail content can intercept its synthetic hit test; real-device touch acceptance
remains open.

### Managed user permissions

Lumen's per-user permission editor now localizes its own loading, service-load,
save and retry feedback, delegation and administrator notices, permission group
headings, Age Gate choices, destination group, and save confirmation in English,
French, and Arabic. The existing permission-bit handling, delegated-rights gate,
service destination filtering, `contentRestricted` update, confirmation step, and
API payloads remain unchanged.

The French desktop/phone regression covers delegated permission bits (including
the high music-request bit), destination selection, Age Gate save behavior, and
confirmation copy. The Arabic regression checks translated permission groups,
Age Gate, destination labeling, and responsive overflow. Matching baseline and
candidate screenshots were inspected at 1440px and 390px and retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-managed-permissions-localization-20261124/`.
These fixture-backed checks do not verify live user authorization or service
configuration against a production SeerrNG instance. A role regression also
checks that a delegated manager cannot open an administrator's permission panel,
and cannot save permissions outside their held grant; the latter shows the
localized delegation warning, keeps every control disabled, and sends no POST.
These role cases pass across desktop, iPhone, Android, and tablet fixtures.

### One-time sign-in links visual acceptance (2026-11-24)

The native administrator page and Lumen per-user sign-in-link panel were
inspected at 1440px desktop and 390px phone widths. Both expose create, copy,
status, and revoke actions; the distinct placement is recorded in the parity
row above. The sign-in confirmation was captured at 1440×900 and 390×664 CSS
pixels. Both interfaces preserve an explicit Continue with sign-in link action
and the ordinary sign-in options. The native screen includes an expected-link
warning; Lumen uses the companion sign-in card and Jellyfin account guidance.
At the 390×664 phone viewport, scrolling the expanded Lumen panel to Revoke
Link places its complete row above the fixed tab bar.

The focused Lumen browser cases passed 4/4 across desktop and iPhone, covering
administrator creation/revocation and confirmation before redemption. Native
reference captures and Lumen candidates, including the scrolled phone panel,
are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-login-links-visual-20261124/`.
This check does not exercise production PostgreSQL or a TLS terminator.

### General settings readback failure recovery (2026-11-24)

The General Settings browser regression now covers a successful update response
followed by stale persisted readback. Lumen reports that it could not confirm
the save, retains the edited application title and enabled retry action, then
accepts the same draft after the readback matches. Existing transport rejection
recovery remains covered. Desktop and iPhone cases passed in English, French,
and Arabic (6/6); the French case also scopes duplicate Users navigation labels
to the settings page content. No server settings or provider connections were
changed by these fixtures.

### Account profile and password load recovery (2026-11-24)

Account Settings now has focused fixture coverage for independent initial load
failures in the profile and password sections. Each section displays its own
retry action; recovering one leaves the other failure visible, and retrying the
second loads its settings without leaving the route. The test passes on desktop,
iPhone, Android, and tablet (4/4). The fixture holds profile reads failed until
the profile retry is activated because account locale/bootstrap consumers also
read that endpoint before the page mounts. This covers initial load recovery,
not managed-user authorization, live persistence, or all account subsections.

### Personal notification load recovery and locale coverage (2026-11-24)

The personal Notifications route now localizes its failed-load title and retry
control instead of falling back to English. The existing retry still reloads the
same authenticated user settings endpoint and renders the notification form
when the read succeeds. Baseline and candidate error-state screenshots were
compared at 1440px desktop and 390px phone widths; French and Arabic candidates
were also inspected at those widths, with no horizontal overflow. The focused
recovery case passed on both the standalone preview and bundled `/lumen/`
mount at desktop, iPhone, Android, and tablet viewports in all three locales
(24 cases). These are synthetic API responses and do not verify an external
notification provider.

### Network administration stale-readback recovery (2026-11-24)

The Network Settings workflow now verifies a successful write response followed
by stale persisted readback. Lumen reports the unconfirmed save, retains the
enabled HTTP-auth draft and acknowledgement, and allows the administrator to
retry until readback matches. Existing validation, rejected-write recovery, and
current-client-IP restriction checks remain in the same browser flow. The
updated workflow passes across desktop, iPhone, Android, and tablet in English,
French, and Arabic (12 cases). This fixture does not apply real transport or
network settings.

### Bookshelf library migration failure recovery (2026-11-24)

The migration browser flow now covers failed preview creation and a failed
move-start request. A failed preview leaves the selected author available for
retry. A failed start discards the old preview token, retains the selection,
and requires the administrator to generate and review a fresh preview before
retrying. The test also retains the existing conflict invalidation, confirmation,
queued-command completion, and post-move configuration refresh checks. It passes
across desktop, iPhone, Android, and tablet (4/4); the BookshelfNG API is
fixture-backed, so no files were moved in a live library.

### Media server connection persisted readback (2026-11-24)

The shared Plex, Jellyfin/Emby, and Tautulli connection editor now performs a
fresh authenticated GET after saving and confirms the persisted non-secret
fields before showing success or replacing its saved form state. Redacted API
keys remain write-only: the editor checks that a key remains configured without
comparing or displaying its value. A stale readback keeps the host, port, and
HTTPS draft available for retry and displays localized feedback. English,
French, and Arabic stale-readback cases pass on desktop, iPhone, Android, and
tablet (12 cases); the full media-library suite passes 36/36 across those four
viewport projects. Matching English baseline and candidate error states were
inspected at 1440px desktop and 390px phone widths; French phone and Arabic
desktop candidates were also inspected. No live media-server credentials or
connections were changed.

### Account profile confirmation retry (2026-11-24)

The localized account-profile workflow now explicitly exercises an accepted
profile POST followed by a failed confirmation GET. It verifies that the user's
edited display name remains available, a retry persists it, and the saved-state
notice appears only after the retry can be confirmed. French and Arabic pass on
desktop, iPhone, Android, and tablet (8 cases). This is fixture-backed API
coverage; it does not verify live account authorization or provider behavior.

### Personal notification preference readback (2026-11-24)

Every personal notification save now uses a fresh notifications-settings GET
after the save POST, covering email, Web Push, OpenPGP, Telegram, Discord,
Pushbullet, and Pushover preferences. Lumen shows the existing save-failure
state and keeps edits retryable if persisted values differ. API credentials are
checked only for configured state; their values remain redacted. Fixture-backed
stale-readback and retry cases pass in English, French, and Arabic across
desktop, iPhone, Android, and tablet (12 cases).
Matching English baseline and candidate save states were inspected at 1440px
desktop and 390px phone widths; the error message fits without changing control
geometry. The API was fixture-backed; no live notification settings were
changed.

### Self-service maturity controls (2026-11-24)

Native SeerrNG exposes Maturity Controls to administrators and user managers
on their own profile. Lumen now shows the matching account link and controls
only to those roles; regular users do not load the maturity settings endpoint.
The native `/profile/settings/maturity` and self
`/users/:id/settings/maturity` bookmarks target the Account Settings section
and preserve query parameters.
Save confirmation checks both the write response and a fresh settings read
before clearing the draft. Stale readback retains the selected ratings and
allows retry.

The complete Account Settings browser suite passes 108 cases across desktop,
iPhone, Android, and tablet. Focused manager cases verify the profile and
self-user bookmarks, stale-readback recovery, successful retry, and regular
user no-read behavior. The standalone production build and bundled SeerrNG
Lumen build pass. Candidate desktop and phone captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-maturity-controls-20261124/`.
The route uses the existing maturity editor and section styles; a direct native
render comparison and live authorization/persistence remain unverified.

Native self-user notification bookmarks now preserve supported channel
fragments (`discord`, `email`, `pushbullet`, `pushover`, `telegram`, and
`webpush`) while retaining query parameters. Unknown channel names safely open
the Lumen notification page without an anchor. A manager opening another
user's notification bookmark is redirected to the managed notification panel;
the route mapper does not load that user's settings before authorization.

### Servarr settings persisted-readback recovery (2026-11-24)

Radarr, Sonarr, Lidarr, Whisparr, book, comic, and sports service forms now
verify a successful create or update against a fresh read of the provider
settings before leaving the editor. Comparison ignores the redacted API-key
value and checks only whether the key remains configured. A stale or failed
readback keeps the form and draft available with localized retry feedback. If a
create returned its assigned service ID but readback was stale, a retry updates
that same ID rather than posting another service.

The Radarr browser regression simulates a rejected write, an accepted create
with stale readback, and a successful delete with stale readback. It checks
that the editor and submitted values remain, verifies create retry uses PUT to
the assigned ID, and verifies delete retry checks fresh state and only removes a service still returned by readback. It also retains the edit workflow. Desktop and phone candidate
error-state captures are compared at the same viewport and inspected for the
shared alert boundary and fixed navigation.
All other provider forms use the same shared component; live provider saves and
production `/lumen/` acceptance remain separate gates.

### Request Override Rules persisted-readback recovery (2026-11-24)

The rule editor compares the successful create/update result against a fresh
rules-list read before closing. If a create succeeded but the readback was stale,
the editor retains its inputs and retries with PUT to the returned rule ID.
Delete confirmation remains open until the list confirms the rule is gone; a
stale read that still contains the rule permits another delete attempt.

The focused browser regression preserves the language/country multi-select
payload, exercises accepted create with stale readback and PUT retry, then
exercises stale delete readback and confirmed retry. The standalone preview test
passes on desktop, iPhone, Android, and tablet. Matched desktop and phone
viewport captures show the existing form layout and alert boundary; bundled
`/lumen/` and live database persistence remain unverified.

### User administration persisted-readback recovery (2026-11-24)

Local account creation now checks the returned user ID and reads that profile
back before closing the form. If the POST succeeded but the readback is stale,
the form keeps the entered values, disables edits that could change the accepted
request, and retries the profile lookup without posting a second account.

User deletion now confirms absence with a fresh `/user/:id` read before closing
the confirmation. A stale read that still shows the account keeps the dialog
open and allows retry; a later 404 completes the action. Self-deletion continues
to sign out after the successful delete response. Browser regressions exercise
create and delete readback recovery and verify no duplicate account POST.

### Reader download workflow localization (2026-11-24)

The shared reader-download controls and sheet now localize file headings,
format labels, loading and partial-source feedback, request selection, and
recovery/close actions in English, French, and Arabic. This covers the shared
Book, Comic, Magazine, and Request History consumers without changing file
identity, request scope, or download URLs. Twelve browser cases pass across
desktop, iPhone, Android, and tablet. At 1440px desktop and 390px phone widths,
the English baseline and candidate captures are pixel-identical; French and
Arabic states were inspected at those widths. The standalone build is verified;
the production Express `/lumen/` mount and live download endpoints remain open.

### Movie collection detail localization (2026-11-24)

The movie collection detail page now localizes its count, section and trailer
labels, media-server verification/unsupported states, Blocklist confirmation,
change feedback, and retry action in English, French, and Arabic. The existing
Blocklist, request, playback, queue, and media-server behavior remains intact.
Twelve localized browser cases pass across desktop, iPhone, Android, and tablet;
the 16 existing collection regressions pass on desktop and iPhone. The English
1440px baseline and candidate captures are pixel-identical. French and Arabic
phone captures were inspected at 390 CSS pixels without clipping or horizontal
overflow. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-collection-detail-20261124/`.
The production Express `/lumen/` mount and live provider-backed media-server
verification remain open.

### Shared control accessibility and localization (2026-11-24)

The shared Lumen media cards and loading placeholders now localize season
selection, comic edition selection, Kavita reading links, audiobook narrator
actions, carousel scroll controls, and loading accessible names in English,
French, and Arabic. The collection-request quality select now takes its
accessible name from its existing visible localized label instead of an
overriding English-only `aria-label`. The complete-series Kavita action had a
separate hard-coded branch; it now uses the same localized accessible name and
visible action label as other comic-card reading links.

Browser coverage checks French comic carousel and edition controls at desktop
and iPhone sizes, a French loading placeholder, and the collection quality
select's accessible name. The focused game loading recovery tests and collection
request localization case also pass. Matched `/comics` baseline and candidate
screenshots were captured at a 1440x900 desktop viewport and an iPhone 13
390x844 CSS-pixel viewport (rendered as a 1170x7080 full-page image). The page
geometry is pixel-identical in the resting state; the desktop hover state
differs only in translated action text for edition selection and Kavita
reading, with no layout shift or overflow. Captures are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-shared-accessibility-20261124/`.
This validates the changed shared surfaces represented by those fixtures, not
every consumer route or the production Express `/lumen/` mount.

### Genre-directory tile accessibility (2026-11-24)

Movie and series genre tiles now localize their accessible browse names while
preserving the genre name supplied by SeerrNG. English, French, and Arabic use
the same `Browse {name}` intent; route targets and the visible genre labels are
unchanged.

The French `/movies/genres` regression verifies the accessible name and link
target on desktop and iPhone. Matched baseline and candidate captures at
1440x900 and 390x844 CSS pixels are pixel-identical because only the
accessibility name changed. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-genre-accessibility-20261124/`.
The standalone client was verified; a production-mounted run remains open.

### Configured Discover shelf localization (2026-11-24)

Administrator-configured studio and network shelves now localize their
company-browse accessible names and “See all” action. Custom shelf fallback
titles, load errors, and Retry are also localized; selected companies, filter
IDs, shelf destinations, and retry behavior are unchanged.

French browser coverage verifies a studio browse link, its See all destination,
and a failed custom shelf followed by successful retry on desktop and iPhone.
Matched baseline and candidate screenshots were inspected at 1440x900 and
390x844 CSS pixels. The French error and control copy is longer, increasing
content height by 16 desktop pixels and 66 phone pixels, with no horizontal
overflow or clipped controls. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-configured-shelf-localization-20261124/`.
The standalone client was verified; the production Express `/lumen/` mount
remains open.

### Lumen instance request summary localization (2026-11-24)

The instance request policy summary on Lumen's administrator settings page now
localizes its heading, explanatory text, and Request Defaults link in English,
French, and Arabic. The link still opens `/admin/requests`; request policy
values and settings save behavior are unchanged.

The existing administrator settings browser fixture passes on desktop and
iPhone in all three locales, including its settings save/readback interaction.
Matched baseline and candidate screenshots were captured from the same route
and viewport. English is pixel-identical. French desktop and Arabic desktop
retain the same page height; French iPhone grows by 87 rendered pixels (29 CSS
pixels) as the translated label wraps, with no horizontal overflow. Evidence is
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-policy-localization-20261124/`.
Live administrator settings persistence and the production Express `/lumen/`
mount remain open.

### Global page-crash recovery localization (2026-11-24)

Lumen's shared page error boundary now localizes its title, recovery guidance,
and Reload action in English, French, and Arabic. The fallback still preserves
the application shell and its navigation, and the Reload button retains its
existing full-page recovery behavior.

The malformed Discover response regression runs all three locales and confirms
that `/me` remains reachable after the page crashes. It passes on desktop and
iPhone in the standalone test deployment. Matched baseline and candidate
captures at 1440x900 and iPhone 13 390x844 CSS pixels have equal dimensions in
every locale; only the translated error copy changes. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-page-boundary-localization-20261124/`.
Bundled `/lumen/` and production Express mount behavior remain unverified.

The neighboring `shared-extra-request-localization` fixture exposed a stale
Music assertion: the first click opens the request sheet and submission needs a
successful quota read plus explicit confirmation. That workflow and its
localized failure feedback are corrected in the entry below.

### Adult detail load-error localization (2026-11-24)

Adult scene detail failures now use a localized “could not load this scene”
heading in English, French, and Arabic. The provider error, page layout, and
request actions are unchanged.

The focused failure-state browser fixture passes for all three locales on
desktop and iPhone. Matched standalone baseline and candidate captures at
1440x900 and iPhone 13 390x844 CSS pixels have the same dimensions; the changed
region is the translated heading. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-adult-load-error-localization-20261124/`.
Bundled `/lumen/` and production Express mount checks remain open.

### Music request workflow and feedback localization (2026-11-24)

The shared Music request workflow fixture now follows the current confirmation
sheet, provides the quota response required to enable submission, and verifies a
rejected request can be retried successfully before checking the Adult request.
The Music confirmation action now uses Lumen's translated request label, and
server failures pass through the active locale translator. This fixes English
fallbacks in French and Arabic while preserving request payloads, quota checks,
and retry behavior.

The focused workflow passes all six English, French, and Arabic cases on desktop
and iPhone, including the 500 response, retry, Adult destination selection,
payload assertions, and RTL/overflow checks. The Lumen production build passes.
Matched open-sheet baseline and candidate captures at 1440x900 and iPhone 13
390x664 CSS pixels show unchanged layout and translated confirmation copy.
Failure-toast behavior is asserted in all locales. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-music-request-localization-20261124/`.
Live quota and provider submission, and the production Express `/lumen/` mount,
remain unverified.

### Game Finder API error localization (2026-11-24)

Generic QuestarrNG API failures in Game Finder now pass through Lumen's active
locale translator. English, French, and Arabic preserve the existing results
and retry action while displaying the localized server error.

The saved-search workflow regression passes in all three locales on desktop,
including the 500 response and retry path. Matched 1440x900 baseline and
candidate captures show unchanged panel geometry and localized error copy. The
pre-fix baseline reproduces English failure copy in French and Arabic. Evidence
is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-game-finder-error-localization-20261124/`.
Live QuestarrNG behavior and production `/lumen/` mounting remain unverified.

### One-click movie and TV request error localization (2026-11-24)

The shared poster quick-request hook now translates generic server, session,
permission, and connectivity failures through the active Lumen locale. It
preserves the existing one-click authorization, request destination, quality,
payload, and success behavior. The card overlay is desktop-only, so the focused
interaction is exercised on desktop.

The movie 500 regression passes in English, French, and Arabic, and the existing
Escape/Cancel focus-return cases still pass. Matched 1440x900 captures show the
same Discover layout and localized toast; the pre-fix French baseline shows
English error text. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-one-click-request-error-localization-20261124/`.
Live request processing and the production `/lumen/` mount remain unverified.

### Movie and TV detail request error feedback (2026-11-24)

Movie and TV detail request failures now pass generic server, permission,
session, timeout, and connectivity errors through the active Lumen translator.
Episode submission and TV season-watch-gate failures use the same translated
error handling. Streaming-policy override dialogs, request destinations,
seasons, quality, and payloads are unchanged.

The direct TV request 500 regression passes in English, French, and Arabic on
desktop. Its assertion verifies the fixed toast no longer covers the primary
request action. Matched 1440x900 baseline and candidate captures show the toast
below the action in the candidate; the baseline overlaps the action. Evidence is
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-detail-request-error-localization-20261124/`.
The direct movie-detail 500 regression also passes in English, French, and
Arabic on desktop, with no horizontal overflow. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-movie-detail-error-localization-20261124/`.
Live Arr behavior, phone layout, and production `/lumen/` mounting remain
unverified.

### Book and comic card request errors (2026-11-24)

Quick book-card and recommended comic-edition requests now pass generic errors
through the active locale translator. The shared request fallback has explicit
English, French, and Arabic copy. This closes uncovered error-message paths in
those card actions.

Six desktop browser cases pass for both actions in English, French, and Arabic.
At 1440x900, before/after captures compare the same hovered poster and resulting
toast. The baseline at `bdde62ae9` reproduced English server-error copy in
French and Arabic for both cards; the candidate displays localized copy without
changing poster or page geometry. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-card-error-localization-20261124/`.
Phone layout, live provider behavior, and production `/lumen/` mounting remain
unverified.

### Shared paged catalog failure and retry localization (2026-11-24)

`usePaged` now retains the failure cause and formats it with the active locale
when rendered, so changing locale does not leave a stale English message.
`MoreOnScroll` uses the existing localized catalog error, Retry, and loading
messages unless a page supplies its own copy. This covers shared paged lists
across Books, Discover, Comics, Music, Games, Sports, and related content.

Twelve Books catalog cases pass across desktop, iPhone, Android, and tablet in
English, French, and Arabic. Each forces a 500 on the first catalog request,
verifies both the detail message and the retry control, then succeeds on retry.
On mobile, scrolling to the retry control hides the fixed tab bar to avoid
overlap, and scrolling back to the top restores it. The pre-change baseline at
`4bf115cf0` rendered English server, load-more, and retry copy in French and
Arabic across all four viewport projects. Matched 1440x900, iPhone, Android,
and tablet captures were inspected; messages now follow the locale while the
existing page, retry control, and tab-bar behavior remain intact. Evidence is
retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-paged-error-localization-20261124/`.
Other list consumers, live provider responses, and production `/lumen/` mounting
remain unverified.

### Shared API detail error localization (2026-11-24)

`useApi` now retains a failed request and formats its default error with the
active Lumen locale. Caller supplied formatters remain in control. The shared
`ServiceNote` also localizes its default Retry button, so detail screens no
longer show English server errors and retry controls in French or Arabic. Movie
and TV detail load failures now localize their headings as well.

The shared `ServiceNote` fallback heading now translates the full “Couldn’t
load {what}” phrase. Consumers retain supplied titles; callers pass localized
`what` labels where they have them. The Comics catalogue is the representative
shared-consumer regression, including its independent load-more alert.

Issue-list failure headings use the page's full localized name in English,
French, and Arabic, and retry successfully. The Games list now passes its
existing localized catalogue label into the same heading. Issue browser cases
pass across desktop, iPhone, Android, and tablet; the French desktop baseline
and candidate show the heading corrected from “Impossible de charger issues”
to “Impossible de charger les signalements”. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-issue-error-localization-20261124/`.

The Movie detail failure and recovery fixture passes in English, French, and
Arabic across desktop, iPhone, Android, and tablet. It forces a 503, checks the
localized message and Retry label, retries successfully, and checks for
horizontal overflow. Matched desktop and iPhone baseline/candidate captures
show the French server message and Retry button switching from English to
French. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-useapi-error-localization-20261124/`.
This validates the shared hook and one representative consumer; every other
`useApi` screen and live service response still needs its own parity review.

The remaining untitled `ServiceNote` callers now provide locale-aware `what`
labels across settings, Games, setup, and request administration. A TypeScript
AST scan finds no string-literal `what` props on untitled `ServiceNote` elements.
Dynamic labels and caller-supplied titles still require route-level review.

### Watch Session saved-genre recovery

When a saved movie genre is no longer present in SeerrNG's current genre list,
the Watch Session editor keeps the stored ID selectable so users do not lose
their filter. Its fallback label now follows the saved Lumen locale (English,
French, or Arabic) instead of displaying English in French and Arabic sessions.
The browser regression verifies the retained checkbox on the owner edit screen
at desktop, iPhone, Android, and tablet sizes. It does not verify live genre
catalog changes or native-matched visual acceptance.
