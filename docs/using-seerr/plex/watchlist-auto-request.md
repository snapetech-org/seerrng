---
title: Watchlist Auto Request
description: Automatically request Plex and SeerrNG watchlist items
sidebar_position: 1
---

# Watchlist Auto Request

SeerrNG supports user-scoped watchlists for movies, series, music, books,
comics, and magazines. Plex users can also combine Plex Watchlist movies and
series with their SeerrNG entries. Automatic requests are available for Plex
Watchlist movies and series, and for local music, books, comics, and magazines.

Both administrator permissions and the matching toggle in the user's profile
are required. Auto requests still follow request permissions, quotas,
availability, and blocklist state.

## Find Items in Your Watchlist

When your SeerrNG watchlist is local-only, you can search titles, filter by
media type, and sort by saved order, recently added, or title. The saved order
keeps the list in the order items were added.

When a Plex Watchlist is combined with SeerrNG entries, filtering and sorting
are unavailable. SeerrNG keeps local entries in their saved order and preserves
the order of items returned by Plex. This avoids presenting a filtered page as
complete when Plex supplies its list in separate remote pages.

## Plex Watchlist: Movies and Series

This path is available to users who sign in through Plex and have access to the
Plex server configured in SeerrNG.

An administrator grants **Auto-Request** and the applicable **Auto-Request
Movies** and/or **Auto-Request Series** permission. In their profile under
**General**, the user enables the matching **Auto-Request Movies** or
**Auto-Request Series** toggle. SeerrNG periodically checks the Plex Watchlist
and submits requests for eligible items that are not already available.

Plex Watchlist pages hydrate item details with at most five concurrent
requests. If an individual item times out or Plex cannot be reached, SeerrNG
skips that item for the current sync and continues with the rest; a later
scheduled or manual sync can try it again. Authentication and other provider
errors still fail the retrieval so the problem remains visible.

After SeerrNG handles a Plex Watchlist entry, deleting its request or removing
the downloaded media does not trigger another automatic request while the item
stays on the list. Remove the item from Plex and add it again to start a new
auto-request cycle. On the first sync after an upgrade, SeerrNG uses matching
auto-request records that remain in request history to seed tracking and avoid
a duplicate request.

## Local SeerrNG Watchlist: Movies and Series

Local SeerrNG watchlists support movies and series for tracking. Add an item
from its detail page or poster card. Adding a local movie or series does not
start an automatic request; use the Plex Watchlist flow above for automatic
movie and series requests.

## Local SeerrNG Watchlist: Music, Books, Comics, and Magazines

Add music albums, books, comics, or magazines from their detail page or poster
card. To submit a request automatically, the user needs **Auto-Request** plus
the permission for that format, then enables its toggle in their profile under
**General**:

- **Auto-Request Music**
- **Auto-Request Books**
- **Auto-Request Comics**
- **Auto-Request Magazines**

SeerrNG submits an eligible request when the item is added to the local
watchlist. For books, the request uses the default configured ebook destination
when available, then the audiobook destination, and otherwise follows the
standard book request default.

## For Administrators

Open **Users > [Select User] > Permissions** and grant **Auto-Request** and the
specific format permissions the user should have. The user's profile toggle is
still required. You can set defaults for new accounts under **Settings >
Users > Default Permissions**.

## Limits

- Automatic requests obey the user's request quota, required request
  permissions, existing availability, and blocklist entries.
- 4K movie and series requests are not created by the Plex Watchlist flow.
- Users can remove local music, book, comic, and magazine entries from their
  SeerrNG watchlist at any time.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [Upstream Seerr issue #1436](https://github.com/seerr-team/seerr/issues/1436) — [@AziRizvi](https://github.com/AziRizvi).
- [Upstream Seerr issue #3235](https://github.com/seerr-team/seerr/issues/3235) — [@ik8sqi](https://github.com/ik8sqi).
- [Upstream Seerr PR #3251](https://github.com/seerr-team/seerr/pull/3251) — [@0xSysR3ll](https://github.com/0xSysR3ll).
- [Upstream Seerr PR #3506](https://github.com/seerr-team/seerr/pull/3506) — [@JamyPatch44](https://github.com/JamyPatch44).

[Back to the Seerr / SeerrNG feature comparison](../../feature-comparison.md).
