# Lumen workflow parity

Lumen should support the SeerrNG workflows a signed-in user or administrator is
authorized to use. The bundled `/lumen/` frontend and the independent companion
both need working entry points. Native routes remain the behavioral reference
during migration. A link into full SeerrNG does not establish Lumen parity.

> The inventory below comes from the native route tree and navigation model
> and Lumen's route table, sidebar, mobile tabs, and API consumers. A route
> match is evidence of reachability only. Compare the behaviors inside it.

## Workflow inventory

| Area | Native reference | Lumen baseline | Parity work |
| --- | --- | --- | --- |
| Discovery and search | `/`, `/search`, `/discover/*` | Movie, series, ebook, audiobook, music, comics, magazine, games, sports, and adult browsing. Search has movie, series, book, audiobook, and comic scopes and people in All. | Compare category and provider gating, filters, paging, empty and partial results, genre and network/studio pages, saved discovery settings, TMDB lists and collections, and search across enabled media. |
| Software and games | `/software`, `/discover/games`, `/discover/patches`, `/games` | Games browse and detail. | Software and patches discovery, platform choice and request eligibility, software history/inventory, private games library, and household sharing. Check that a browse route does not substitute for a library route. |
| Library and saved items | `/library`, `/profile/watchlist`, `/discover/watchlist`, `/share`, `/following` | Media availability and play links appear on applicable titles. | My Media, watchlist filters and actions, sharing, follow feed and unread state, and provider-specific favorite and collection actions. |
| Calendar and group viewing | `/calendar`, `/coming-soon`, `/swipe`, `/watch-sessions` | Coming Soon groups upcoming movies and series and offers requests. | Full release calendar with source and media filters, swipe discovery, and watch-session creation, membership, and playback flow. |
| Requests | `/requests`, `/track-requests`, user request routes, detail request dialogs | Request progress and management actions, including supported 4K paths. | Audit exact title and edition identity, series and episode selection, over-quota approval, request history, retry and explicit Sonarr mapping, cleanup, and delegated actions. Compare each media category independently. |
| Acquisition tools | `/downloads`, `/indexer-search` | Per-request download progress. | Dedicated queue and history, exact destination selection, permitted download actions, indexer search, and authorized handoff. |
| Issues and blocklist | `/issues`, `/issues/[issueId]`, `/blocklist` | Full SeerrNG link from the account menu where permitted. | Issue creation, listing, comments, status changes, and blocklist display and management with the same per-action permissions. |
| Accounts | `/profile/*`, `/users/*` | Sign-in, account summary, and Lumen preferences. | Profile editing, password, linked accounts, client tokens, notifications, per-user TV and Episode Queue policy, maturity, permissions, and delegated user administration. |
| Instance administration | `/setup`, `/settings/*` | Lumen presentation and branding settings, administrator handoff. | Setup, general and network settings, libraries, services and profiles, jobs, logs, notifications, metadata and discovery, category access, indexers, and library migration. Preserve validation, dirty-state tracking, failed-save recovery, and existing provider boundaries. |

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

### Open gap in personal discovery accounts

Lumen's Linked Accounts page manages sign-in methods and personal tracking
accounts. My Media can read libraries from linked tracking accounts. The
Lumen administrator Discovery page manages instance credentials. Lumen can
connect Trakt, AniList, and Simkl from Linked Accounts.

| Workflow | Existing API and acceptance |
| --- | --- |
| Read, disconnect, and allow writes | Lumen Linked Accounts uses the authenticated discovery accounts endpoint and provider-specific delete and preference operations. Desktop and iPhone browser fixtures verify preference readback, a denied write, cancellation, and confirmed disconnection. Live provider and matched visual verification remain open. |
| Trakt | Lumen completes the existing server-verified callback from Linked Accounts. Use the configured HTTPS application origin so the browser can return with its session and callback cookies. Server tests cover Classic PKCE and bundled and standalone return routing. Desktop and iPhone fixtures cover account-owner linking and single-use completion. Live provider and matched visual verification remain open. |
| AniList | Lumen opens the provider authorization URL and submits the returned code through the completion endpoint. Desktop and iPhone browser fixtures cover successful readback, clearing the code on cancellation, and keeping the code out of the URL. Live provider and matched visual verification remain open. |
| Simkl | Lumen displays the device code and expiry, then polls at the server's interval. Polling stops on expiry, cancellation, account change, or unmount. Desktop and iPhone fixtures cover cancellation, a changed polling interval, and account readback after approval. Live provider and matched visual verification remain open. |

The shared server routes live in `server/routes/discoveryIntegrations.ts`.
Classic's account controls are in `src/components/DiscoveryIntegrations/Accounts.tsx`.
The Linked Accounts and My Media browser suites run against both the standalone
build and the production bundle served by Express at `/lumen/`. Desktop and
iPhone cases cover the provider round trips, library selection and pagination,
private matches, and tracking updates using fixture API responses. Live provider
effects and matched visual acceptance remain unverified.

### Game Finder verification

Lumen supports filtered QuestarrNG searches, saved searches, notification
preferences, and retrying a failed page without losing earlier results.
The desktop and iPhone browser fixtures cover search, pagination, retry,
save, run, delete, and game detail links on both standalone Lumen and the
production bundle served by Express at `/lumen/`. The bundled frontend
redirects the Classic `/discover/games` entry point to Game Finder. Live
QuestarrNG effects and matched visual verification remain open.

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

Book details offer Follow New Releases for an identified author. Audiobook
details offer Follow for each listed solo narrator in the narration picker.
Twenty-four browser cases passed per deployment across desktop, iPhone,
Android, and tablet. API fixtures verify author follow and unfollow,
narrator identity, and preservation of an explicitly selected edition.
Matched visual and live provider verification remain open.

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
separate discovery workflow. Calendar presentation and title-link behavior
need rendered qualification on both deployments.

Headed Chrome at 1440 × 1000 rendered the standalone calendar with a timed TV
episode, an all-day audiobook, and a partial-source warning. Next Month moved the
fixture query from November to December 2026. The isolated desktop could not
reach the preview, so verification used a dedicated Agent GUI VM session.
Narrow and bundled visual acceptance remains open.

### My Media browse increment

Lumen serves `/library` in both deployments and exposes My Media in desktop
navigation and under You. It lists libraries from connected Plex, Jellyfin,
Emby, Trakt, AniList, and Simkl accounts, preserves server cursors, and opens
only confirmed catalog identities. Linking accounts, identity repair and
mapping packs, provider tracking writes, library sharing, and the standalone
watchlist workflows remain open. Narrow and bundled visual acceptance remains
open.

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
ownership source cannot be distinguished. Watchlist creation from details and
posters, delegated watchlists, and combined-list local actions remain open.

Headed Chrome at 1440 × 1000 verified a movie filter opened from a bookmarked
URL, cleared it to show a second item, and removed the movie through the
fixture API. The remaining book was still shown after the server response.
Narrow, combined Plex, and bundled visual checks remain open.

Movie and series details now offer the local Watchlist action. The action
checks current membership and title identity before writing and uses the
existing authenticated SeerrNG endpoint. Plex Watchlist actions, poster
controls, and the other media categories remain open.

Headed Chrome at 1440 × 1000 rendered the local-account movie action and
verified Add and Remove against a synthetic API. The series and narrow
renders, the unavailable branches, and bundled visual acceptance remain open.

The local detail action now also covers Open Library works, MusicBrainz
release groups, ComicVine editions, and magazines. It uses the same permission
and preflight checks as movie and series details and keeps provider identities
separate. Bookshelf-only works without an Open Library identity still cannot
use SeerrNG's existing local Watchlist API. Poster and Plex actions remain open.

Headed Chrome at 1440 × 1000 rendered the Open Library detail action. Add and
Remove completed against a synthetic account and used the canonical work ID in
the request. Visual checks for albums, comic edition changes, magazines,
narrow layouts, and bundled deployment remain open.

### Download Inbox browse increment

Lumen's Download Inbox shows active warnings, resolved items, and intervention
history for accounts with Manage Downloads access. Direct navigation with no
permission shows the access message and does not fetch queue data. The
standalone proxy serves the screen directly.

Headed Chrome at 1440 × 1000 verified the authorized Inbox, History switch,
partial-source warning, and expanded action record against synthetic data.
Narrow and bundled visual checks remain open. The Inbox is loaded on demand
so the home entry does not download its 1.51 kB gzip route chunk.

Lumen's Download Inbox now also offers manual import and rejection. The
import sheet uses the backend's current file preview, eligible selections,
confirmed library target, and preview fingerprint. Rejection offers distinct
blocklist and client-removal controls, with client removal off by default.
Both actions re-read the inbox after submission or an uncertain result.
Headed Chrome at 1440 × 1000 verified the manual import and rejection flows
against synthetic data. Mobile and bundled visual checks for the Download Inbox
remain open.

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
existing page header, search, toolbar, and list roles. Mobile visual acceptance,
comparison against rendered native workflows, and an end-to-end live service
check remain open.

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
comment submission, and resolution against synthetic data. Mobile, bundled,
and equivalent rendered native comparisons remain open. Creation, editing and
deletion of reports or comments, advanced filters and title metadata, and
Blocklist remain open.

### Issue reporting increment

Lumen media details can create reports for movies, series, books, albums,
comic editions, and magazines. The action uses the internal media ID of the
displayed item and the signed-in reporter. The form follows native media
availability, issue type, subtype, and quality rules. Series reports can
scope multiple seasons to whole seasons or selected episodes. Confirmed
submissions open the new discussion.

Headed Chrome at 1440 × 1000 rendered the standalone movie sheet and confirmed
a report with a synthetic API that accepted only the exact internal media ID,
type, quality, and description. The native comparison, mobile and bundled
layouts, and other media branches remain visually unverified. Reporting on
behalf of another user and editing or deleting reports and comments remain open.

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
Mobile and bundled visual checks remain open. Reporting on behalf of another
user, advanced filters and title metadata, and Blocklist remain open.

### Blocklist browsing and removal increment

The Lumen Blocklist uses the authorized count endpoint for desktop and You
navigation, keeping the current link visible while the route is active. The
page supports native search, media, source and date filters, sorting and
pagination. Accounts with View Blocklist can browse. Managers can also
confirm removal using the affected entry's TMDB or external identity.

Headed Chrome at 1440 × 1000 verified the standalone list, exact encoded
external ID removal, and empty navigation state against a fixture. Mobile and
bundled visual checks and the rendered native comparison remain open. Adding
entries from media details, collection actions, and automatic rule setup
remain open.

### Blocklist media detail increment

Managers can confirm adding or removing a title from movie, series, album,
Open Library book, ComicVine edition, and magazine details. The action looks
up the exact canonical identity and rechecks the detail, entry, and
navigation count after a change. Request controls reflect Blocklisted after
detail refresh. Bookshelf-only records without a supported Open Library work
identity are excluded from the detail action.

Headed Chrome at 1440 × 1000 compared the standalone movie detail with its
previous build. The synthetic API confirmed an empty 201 add response and
204 removal, and the UI switched both the request button and navigation after
readback. Other media, mobile, and bundled visual acceptance remain open.
Collection actions and automatic rule setup remain open.

### Movie collection and collection Blocklist increment

Movie details and All or Movies search results open a Lumen collection page
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

### Personal profile and password increment

You links to Account Settings. Users can save display name, non-Plex email,
metadata language, and regional-format preferences for their own account.
The form submits only changed fields, preserves failed drafts, and confirms
saved profile values by reading them back. The separate password form uses
the server's password-presence flag, confirms the new password locally, and
clears password fields after each submission.

Headed Chrome at 1440 × 1000 verified standalone entry from You, a rejected
edit with its draft retained, successful retry and name readback, and a
password change with synthetic credentials. Native baseline, mobile and
bundled visual acceptance, live password and provider paths, interface
localization, linked accounts, tokens, and other account settings remain open.

### Client token increment

Account Settings links to Client Tokens. The page uses the existing signed-in
session endpoints to list token metadata, create Discover and/or Request
tokens with a selected expiry, and revoke after confirmation. The creation
secret stays in component state and disappears when dismissed or when the
user leaves the page.

Headed Chrome at 1440 × 1000 verified standalone list loading, creation of
a seven-day Discover token, one-time display, and revocation with synthetic
data. Clipboard use, native comparison, mobile and bundled visual checks,
and an external client round trip remain open.

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

Headed Chrome at 1440 × 1000 verified standalone request and reset forms using
a synthetic API, including mismatched confirmation and successful POSTs.
The server tests verified bundled link routing and native and external
fallback. Live SMTP, mobile and bundled browser rendering, and native
visual comparison remain open.

### Request retry increment

Lumen offers retry on personal and Everyone request rows using the current
lifecycle stage, requester identity, media permission, and retry eligibility.
Request managers can also reapply an eligible Episode Queue start. Failed
rows explain the server's bounded dispatch and TVDB failure reasons. A
TVDB season mismatch requires manual recovery in native SeerrNG.

Headed Chrome at 1440 × 1000 verified the standalone personal request list
using a synthetic API. An eligible TV request changed from Failed to
Searching after Retry. An owner season mismatch and another user's request
both lacked the Retry action. Native baseline comparison, mobile, bundled,
other media and quality combinations, and live service checks remain open.

### Request history increment

Lumen request rows open the latest lifecycle events and current stage from
SeerrNG's permission-checked request detail endpoint. Events show timestamps,
retry attempts, and recorded messages. The UI marks truncated histories and
uses the existing sheet, list and error controls.

Standalone Chrome at 1440 × 1000 verified a personal TV request with two
events across two attempts, newest first, and dismissal with Escape.
Native visual comparison, mobile, bundled, delegated browser verification,
and the software-request and download-file history workflows remain open.

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

Standalone Chrome at 1440 × 1000 verified the ebook detail entry point. A
synthetic response included another user's request, another media ID and an
audiobook-only request. Only the matching combined request was queried for
files and only its ebook appeared. Native visual comparison, mobile, bundled
and live provider verification remain open, along with browser coverage for
the other reader categories.

### Request deep links increment

Lumen opens request history from `/requests?requestId=…` and from the
`/requests/status` alias used by notifications, including requests absent
from the current list. Bundled Lumen preserves the request ID when it is the
selected or enforced frontend. Authorization stays with the existing
request history endpoint. Closing history preserves the selected tab.

Standalone Chrome at 1440 × 1000 verified the notification alias with an
empty request list, an authorized history, Escape dismissal, and a 403
response with no history or files. Server tests cover bundled redirects,
classic preference, invalid or duplicate IDs, and the frontend lock.
Native visual comparison, mobile and bundled browser checks, software
request links, and full management from focused links remain open.

### Software request history increment

Software request rows and `softwareRequestId` notification links open the
permission-checked status, event history, and available files or bundle for
the exact request. The bundled frontend redirect preserves software IDs
separately from media request IDs.

Standalone Chrome at 1440 × 1000 verified a direct software notification
link, its history and download choices, and a missing request response.
Server routing tests cover the bundled redirect. Native comparison,
mobile, bundled browser checks, live providers, and software moderation
and recovery actions remain open.

### Software request actions increment

Software Request History offers approval, decline, withdrawal, cancellation,
retry, stop tracking, and clearing cancelled history based on ownership,
permission, request state, and provider capabilities. When the server cannot
confirm a previous handoff, retry or cancellation waits for the user to check
the download queue and history and explicitly confirm there is no match.

Standalone Chrome at 1440 × 1000 verified that an owner retry waited for
explicit confirmation after a synthetic 409 and refreshed to Searching after
the confirmed retry. Native visual comparison, mobile, bundled, delegated
roles, other actions, and live provider behavior remain unverified.

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
New browser registration and Lumen service-worker delivery remain open.

Standalone Chrome verified device removal against a synthetic API, with an
empty device list on API readback. Mobile, bundled and native visual checks
remain open.

### Browser push registration increment

Lumen registers a push worker in an account-specific scope outside its app
pages. The standalone cleanup targets the legacy root worker and preserves
the new registrations. Bundled Lumen leaves the native root worker alone.
Notification clicks validate the destination and preserve supported request
links under the appropriate frontend base.

Worker tests verified notification display arguments, request link resolution
in both deployment layouts, and rejection of cross-origin and ambiguous
navigation targets. Real subscription and delivery through a secure browser,
mobile installation, and native visual comparison remain open.

### Current browser push device increment

Lumen matches the current account's dedicated browser registration to the
server device list. It labels the matching device and allows disabling it.
Confirmed removal clears the server subscription first, then unsubscribes the
local browser only when its account, worker and endpoint match.

An isolated test verified that disabling one browser does not unsubscribe a
different endpoint, another account's worker or the native worker. Secure
browser interaction, mobile installation and live delivery remain open.

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

Standalone Chromium fixtures passed the profile save and retry flows and
verified that a non-Plex user with movie and music permission can turn off
music auto-requests without seeing the Plex movie or ungranted book control.
The exact false value persisted through page reload at desktop, iPhone,
Android and tablet viewport presets. The fixtures also surfaced a provider
response shape that could crash Account Settings, which is now handled.
Live automatic requests, bundled and native visual comparison remain open.

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
detail-to-discovery tag link. Interactive keyword selection remains open.

Movies and Series now offer interactive subject-tag search and selection
through SeerrNG's keyword endpoint. Users can include, exclude, move and
remove tags while preserving other filters. Standalone browser checks
verified the Movies interaction and shared links at four viewport presets.
Live keyword results and bundled and native visual comparisons remain open.

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
repeated search parameters, and unsupported routes. The native Games
library and Discover Watchlist still need distinct Lumen workflows. Live
browser validation of the bundled redirects remains open.

### Discover Watchlist

The personal watchlist links to a separate Discover Watchlist. Discovery
uses the viewer-filtered discovery endpoint, applies the instance's media
category settings, and shares the personal screen's filters, paging, and
local removal. The bundled lock and companion redirect preserve the
native Discover Watchlist link and its supported filters.

Twenty standalone browser checks passed across desktop, iPhone, Android,
and tablet. They cover both endpoint scopes, hidden media categories,
filter paging, and existing personal watchlist actions. Server redirect
tests and the companion redirect inventory check passed. Live bundled and
companion browser checks and matched visual comparisons remain open.

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
entry requests only its selected feed. Bundled route tests, companion
container checks, and twelve standalone browser checks across desktop,
iPhone, Android and tablet passed. Matched visual and live provider
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
Discover's quick-request hero remains scoped to movies and series.
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
SongID and Soulseek endpoints. Eight standalone browser fixtures passed
for identification and the track queue across four viewport presets.
Live services, bundled rendering, and matched native visual comparison
remain open.

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

The Account administration section opens System Logs inside Lumen.
Administrators can search and filter logs, page through results, inspect
structured data, copy an entry, and opt into live refresh. Log responses
bypass persistent application and HTTP caches. TypeScript, the production
build, and four standalone browser fixtures passed for search, details,
and non-admin route denial. Live server logs, clipboard and refresh,
bundled rendering, and native visual comparison remain unverified.

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
editing, run confirmation, and DNS flush. Live jobs, bundled rendering,
and native visual comparison remain open.

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
Standalone fixtures cover the managed settings actions. Live providers, full
bundled user workflows, and matched native visual comparison remain unverified.

### Delegated watchlists

The user directory and native user-watchlist bookmarks now open Lumen's
read-only view for administrators, request managers, and users with Watchlist
View permission. The directory link requires access to the directory as well.
The view uses the existing authorized user endpoint and shares the filter,
pagination, catalogue-link, and recovery controls with the personal list.

TypeScript, the production build, and 28 standalone watchlist browser cases
passed across desktop, iPhone, Android, and tablet presets. The cases include
directory entry, filtering and pagination on the selected account, absence of
removal, and no watchlist request on a denied direct visit. Express and nginx
tests verified bookmark redirects. Bundled workflow rendering, live Plex, and
matched native visual acceptance remain unverified.

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

Lumen edits six personal theme colors through the authenticated account
API. Classic Advanced Theme bookmarks open the corresponding section in
both deployments. Sixteen browser cases passed per deployment with
fixtures. The real account route suite passed 24 cases, including shorthand
color normalization and readback through `/auth/me` with an unrelated
numeric override preserved. Other Classic theme controls and matched
visual review remain open.

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

General Settings also exposes image caching and automatic version checks.
The shared settings endpoint now validates and persists the version-check
switch used by both frontends. The 102 settings-route tests and eight
standalone General Settings and About browser cases passed. The browser
cases verified that false values remain selected after reloading and that
About skips update checks when disabled.

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
stays visible. Thirty-two standalone watchlist cases and nine server
watchlist cases passed. Live Plex and matched visual acceptance remain open.

Watchlist pagination now reconciles out-of-range pages after the server
reports a smaller result set. This keeps active filters when removal
empties the final page. All 36 standalone watchlist browser cases passed.
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

The production build and four browser checks passed with synthetic movie
recommendations across desktop, iPhone 13, Pixel 7, and iPad Pro 11. The checks
covered request payloads, pass, and undo. Catalog decks, gesture controls,
history, preference editing, and Swipe administration remain open.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-swipe-20261118/`.

Swipe preferences now save series season defaults, book format, recommendation
sources, and taste notes. The active deck uses the saved profile immediately.
Compared collapsed and expanded settings across desktop, iPhone 13, Pixel 7,
and iPad Pro 11. The build and eight synthetic browser checks passed,
including an all-seasons request from the active deck after saving.
Favorite selection and live provider behavior remain open.

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

Swipe deck filters expose title search, applicable genre, publisher, year and
rating criteria, and magazine source. The form resets to the first catalog
page when filters change. The production build and 16 browser checks passed
with synthetic responses. Compared filtered and unfiltered magazine decks on
desktop, iPhone 13, Pixel 7, and iPad Pro 11. The browser fixture verified
public-catalog query parameters and filtered pagination.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-swipe-filters-20261118/`.

Swipe now opens the permitted retro games, apps, and PC games decks. Software
requests use the selected system or OS and architecture, and the deck follows
the server's page continuation. Native and Lumen share the request payload
builder. Compared the PC game and magazine decks across desktop, iPhone 13,
Pixel 7, and iPad Pro 11. The production build, 42 native tests, and 20 browser
checks passed. The browser fixture verified PC target selection and offset
pagination. Live acquisition and software search cursor behavior remain unverified.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-swipe-software-20261118/`.

### Watch sessions

Lumen lists private movie sessions, creates a draft with ranking, release year,
and rating filters, displays room membership, and lets users opt in to
watchlist contributions before the host starts. The production build and four
fixture browser checks passed for creation and preference readback. Inspected
the create and room states on desktop, iPhone 13, Pixel 7, and iPad Pro 11.
Genre selection, invitations, membership management, ballots, matches,
playback, and live multi-user verification remain open.

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
Guest departure and host closure still need direct interaction tests.

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

The watch-session browser suite now covers removing a guest, ending the room,
and leaving as a guest. It verifies canceling before each mutation and the
return to the session list after success. It also follows a group match to the
movie page and checks the Jellyfin playback link. All 20 synthetic browser
checks passed across desktop, iPhone 13, Pixel 7, and iPad Pro 11. The production
build and all 15 isolated watch-session server tests passed. Live provider
playback and cross-device use remain unverified.

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

Native Plex and Jellyfin connection forms still need Lumen coverage before
their legacy bookmarks can move. The classic Services page also includes
software acquisition, reader delivery, recognition, Tunerr, override rules,
and connection import controls that need separate coverage.

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
status and remove a shelf after confirmation. Book and comic detail actions
for creating managed shelves remain separate work.

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
The result distinguishes verified counts from previews. Author and book
series detail routes still need Lumen coverage before exposing this action.

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
proxy and with the bundled Lumen lock. Native bulk requests and series
filters are still separate parity gaps.

The production build, 28 browser checks, two server routing tests, and ten
built-image proxy tests passed. Inspected the new pages against Lumen's book
detail and book grid layouts across desktop, iPhone 13, Pixel 7, and iPad
Pro 11. Browser fixtures checked pagination, order, and shelf preview
identities. Real reader providers were outside the check. Evidence is retained
under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-book-grouping-20261118/`.

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
failed results. Native advanced destination overrides remain separate work.

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
Collection-wide requests, filters, and availability refresh remain open.

The production build, 28 browser checks, two server routing tests, and
ten built-image proxy tests passed. Inspected series and discography grids
using shared Lumen detail and card layouts across four viewports. Live
catalog providers were outside the check. Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-curated-collections-20261118/`.

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
exception identification still need parity review. Evidence is retained
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
edit sheet before and after on desktop, iPhone 13, Pixel 7, and iPad Pro
11. The fixture verifies that saving a newly selected season retains
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
the image to be omitted. A regular proxy image still renders. GitHub
alert 690 remains open pending disposition. Evidence is retained under
`seerrng-lumen-art-url*` in `/mnt/disks/scratch/task-deliverables/`.

Movie trailers now use a fixed YouTube watch origin and a validated
video ID. If a trailer has no valid ID, Lumen checks the next trailer
candidate. Compared movie detail pages before and after on desktop,
iPhone 13, Pixel 7, and iPad Pro 11. The production build and 28 detail
browser checks passed. The trailer fixture verifies the generated
destination and omission of invalid candidates. GitHub alert 670 is
still open. Evidence is retained under `seerrng-lumen-trailer-url*`
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
image URLs. GitHub findings 654–657 remain open. Evidence is retained
under `seerrng-lumen-rendered-art*` in `/mnt/disks/scratch/task-deliverables/`.

Bundled Lumen HTML responses now share a per-client budget of 600
requests per minute, matching the existing API budget. Static files,
missing asset responses, and setup redirects do not consume the shell
budget. The existing client IP helper respects the configured proxy
trust boundary. Both frontend routing integration tests passed,
including deep links and the distinction between shell and asset
responses. GitHub alert 671 remains open. Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-shell-ratelimit-20261118.log`.

ComicVine description formatting now decodes supported entities in one
pass and renders the result as React text. Compared comic details on
desktop, iPhone 13, Pixel 7, and iPad Pro 11. The production build and
seven browser checks passed, with nine responsive-test skips. GitHub
finding 647 remains open on earlier code. Evidence is retained under
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

| Native entry point | Behavior still to cover |
| --- | --- |
| `/users/[userId]` | Both deployments map the bookmark to `/household/:id`. Standalone browser fixtures cover independent permission checks and recovery for request and watchlist previews. The managed-user editor remains a separate action. |
| `/discover/collectors` | Lumen now shows trusted collector picks, links to matched albums, and starts artist release follows. The shared cover renders artwork returned by matched albums. Live artwork and matched visual acceptance remain open. |
| `/discover/book-recommendations` | Both deployments map the bookmark to `/books/recommendations`. Lumen uses the same feed and per-list endpoints for filters and feedback, and retains the format in the URL. Standalone browser fixtures cover creating a personalized feed and applying feedback. |
| `/discover/movies/genres` and `/discover/tv/genres` | Lumen lists genres with artwork from the native backdrop endpoints and links to filtered browse. Live artwork and matched native visual acceptance remain open. |
| `/setup` | Both Lumen deployments open their own first-run setup from their home URL. Administrators can reopen setup from Administration. Lumen has resumable steps, guards unsaved download-client changes, and reviews saved libraries, request services, download clients, and Prowlarr. It groups request-service editors and offers Usenet, torrent, and combined download setup profiles. Matched visual acceptance and live provider verification remain open. |

The household and recommendation browser suites passed 36 cases per
deployment across desktop, iPhone, Android, and tablet. The bundled run
served the production build through the Express mount at `/lumen/`. Both
suites used API fixtures. Live authorization, provider behavior, and
matched visual verification remain open for these targeted checks.

Lumen Movies and Series now link to their genre directories. Legacy
genre-directory bookmarks route to Lumen under bundled frontend lock and
in the companion. The production build, two Express tests, and ten
companion image tests passed. Browser fixtures opened both directories
and followed a genre to its filtered results on desktop, iPhone 13,
Pixel 7, and iPad Pro 11. Matched visual comparison and live provider
states remain unverified.

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
an HTML parser. The artwork URL findings remain open for separate review.

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

Movie collections now offer Watch Trailer for the first visible member in
release order, using the same YouTube validation as title details.
Twenty standalone and four bundled collection checks passed. The fixture
verifies that an invalid trailer ID is skipped in favor of a valid one.
Live metadata and matched visual acceptance remain unverified.

### Bookmark and account workflow verification

| Workflow | Landed on main | Verified | Still to verify |
| --- | --- | --- | --- |
| Watch session links | `734054549` | Bundled default and locked routes preserve list, detail, and invite destinations. The redirect excludes query tokens and remains compatible with browser fragment inheritance. | A production bundled browser run verified the Classic redirect, local sign-in, and membership through the real API with CSRF and SQLite. OIDC and standalone invite acceptance were outside this run. |
| Discovery and catalog bookmarks | `59c94ea41`, `2cb2b54ef`, `544a8f00a`, `8e410df1f` | Bundled redirect cases cover title details and discovery filters. Standalone browser cases cover availability filter selection, explicit quality precedence, and clearing legacy aliases. | Matched standalone and bundled discovery renders at narrow and wide viewports with the affected filters active. |
| Personal and administrator bookmarks | `c057b5047`, `a58961631`, `0e8994380` | Bundled routing cases cover calendar, account, watchlist, search, settings, and dotted magazine titles. They also check Classic opt-in and unsupported settings fallthrough. At 390 and 1440 CSS pixels, the Classic scheduled-jobs bookmark passed real local sign-in, CSRF, and SQLite authorization in bundled Express and standalone nginx. Administrators reached Scheduled Jobs and received HTTP 200. Members landed on their account page and received HTTP 403 from the same endpoint. | Other redirected administrator routes and job mutations. The isolated scheduler was idle. |
| Request bookmarks and My Software | `41b4302b7`, `709e83136`, `698c1568f`, `c6b2863f0`, `a8a136a1e` | Bundled routing, actual standalone nginx redirects, and standalone browser fixtures cover the requester, status, media, format and sort translations. My Software sends only the signed-in user's ID. Matched request renders were inspected at 390 and 1440 pixels. Standalone browser checks verify that a user request bookmark with conflicting requester parameters sends exactly the path user ID to the pending request endpoint. | Bundled desktop and iPhone browser fixtures now start with the Classic status bookmark through production Express routing and verify that My Software sends the signed-in requester. An isolated SQLite route test verifies owner-only results for both implicit and explicit requester filters and rejects another requester with HTTP 403. An isolated bundled browser run at 390 and 1440 CSS pixels followed the Classic status bookmark through real local sign-in, production CSRF middleware, and the software request API with two SQLite rows. Both browsers saw only the signed-in requester’s row after sign-in and reload, and a direct request for the other owner received HTTP 403. A standalone run at the same widths used the current production build and nginx template in the existing Lumen test image. The companion proxied real sign-in, CSRF, and the isolated SQLite software API and passed the same owner-isolation and reload checks. |
| Coming Soon pagination and media filter | `6d9bf45a2`, `338876e79` | Browser fixtures cover paging, retry, and title wrapping. Desktop and iPhone checks cover direct TV links, switching to movies, browser Back, and returning to both feeds. The first TV-only view fetches only the TV feed. Bundled and standalone redirect tests preserve the scope. At 390 and 1440 CSS pixels, both production deployments followed the Classic TV bookmark after real local sign-in, paged the real TV route, switched to Movies, and paged the real movie route. Only the selected feed was fetched, and the real routes passed page and date constraints to a synthetic TMDB provider. | Matched renders of the pagination controls and live TMDB responses. |
| One-time sign-in links | `ed08e9ee9`, `df8b19237`, `ae0cda171` | Standalone browser fixtures cover administrator creation and revocation, explicit redemption, address-bar cleanup, restoration of the requested title, and opening a link into an existing session. | The real session and SQLite API tests verify expiry, revocation, single use, and conflict with an existing session. Compare the expanded administrator panel and sign-in confirmation at matching desktop and mobile widths. |

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
viewports confirmed a standard user was redirected and the API returned
403. Existing rules can be inspected. Creation, editing and deletion,
empty and error browser states, and companion verification remain open.
