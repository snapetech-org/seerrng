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
