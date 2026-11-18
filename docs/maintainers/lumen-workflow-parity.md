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
