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

### Following feed increment

Lumen has a Following route, with a desktop sidebar link and a Library entry
under You on narrow screens. Users with request access can page through updates,
mark them seen, and manage existing subscription notifications, automatic book
requests, and removals. The standalone proxy serves this route directly.

Person details now offer Follow and Unfollow using the native TMDB person
identity. Other source screens, detailed update reasons, and exact links for
game and patch targets still need parity work. The current increment uses
the source label for each update and searches by title when it has no Lumen
detail route for the target.

Headed Chrome at 1440 × 1000 verified the fixture's `/following` feed and
`/me` link. Mark Seen removed the row control and unread action after the
successful response. The rendered rows initially inherited the browser's list
indent. Resetting it in the shared list style aligned the update and subscription
rows with the existing You screen. The isolated desktop could not reach the
fixture, so this check used a dedicated session on the persistent Agent GUI VM.
Narrow and embedded-browser visual acceptance remains open.

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
browser fixtures passed. Live providers, Spotify disconnect and callback
return, bundled rendering, and matched native visual comparison remain open.
