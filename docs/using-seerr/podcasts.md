---
description: Find, follow and download podcasts in Lumen, with Audiobookshelf as the library and player.
---

# Podcasts

Lumen has a **Podcasts** section for finding shows, following them and getting
episodes. Audiobookshelf stores the episodes and plays them; SeerrNG adds the
shows, queues the downloads and keeps track of who follows what.

## Prerequisites

1. Connect Audiobookshelf under **Settings → Services → Audiobookshelf** (the
   same connection books use). The API key must belong to an Audiobookshelf
   account that can add and remove podcasts.
2. Create a **podcast** library in Audiobookshelf. SeerrNG uses the first
   library of type podcast and the first folder in it.
3. Set **External URL** on the Audiobookshelf service so **Listen in
   Audiobookshelf** links open the right address in the browser. Without it the
   links are hidden.
4. Give people the **Request Music** permission (or the general **Request**,
   Manage Requests or Admin) to follow shows and get episodes: podcasts come
   with music. Anyone signed in can browse and search.
5. Make sure Audiobookshelf can reach SeerrNG. Audiobookshelf reads podcast
   feeds and downloads episodes through SeerrNG (see Limits), at the
   **Application URL** or, if set, at **SeerrNG address for Audiobookshelf** on
   the Audiobookshelf service (for example `http://192.168.1.10:5055`).
   Audiobookshelf refuses private addresses by default: for a LAN address, add
   its hostname or IP to Audiobookshelf's `SSRF_REQUEST_FILTER_WHITELIST`
   environment variable (for example `SSRF_REQUEST_FILTER_WHITELIST=192.168.1.10`).
   That lifts the filter for SeerrNG only.

The **Podcasts** menu item appears only when the connection and a podcast
library are found.

## Finding shows

- **Discover** shows the Apple Podcasts top chart, with genre chips and rows
  for a few genres. Charts are cached for six hours.
- **Search** uses Audiobookshelf's podcast search (iTunes). Shows already in
  the library open their own page; the others open a preview with the latest
  episodes from the feed.
- **Your shows** lists the shows you follow or took episodes from, with their
  newest episodes. **Activity** lists downloads in progress.

## Following and getting episodes

- **Follow** adds the show (when it is not in the library yet) and turns on
  automatic download of new episodes in Audiobookshelf.
- From a preview, **Get** on an episode, or **Get all episodes**, adds the show
  without following it: only the chosen episodes download.
- On a show page, **Get** downloads one episode, **Get the latest 5** the
  newest five, and **Get all N** every episode not downloaded yet (after a
  confirmation, since some shows have hundreds).
- **Remove from my shows** appears on a show you took episodes from but do not
  follow.
- **Remove played episodes** (per show, for request managers) deletes an
  episode once every follower of the show has finished it (for a show nobody
  follows: once anyone has), when four newer ones are in and nobody is part way
  through it. An hourly job does the removing, and it skips a run when any
  user's progress cannot be read.

Audiobookshelf has to download an episode before it can play it; SeerrNG does
not stream from the feed.

## Follows are per person

Each follower is recorded on the show in Audiobookshelf as a tag
`follower:<Audiobookshelf user id>`, so other apps that read the same library
(a phone or watch client, for example) see the same follows.

- A SeerrNG account is linked to an Audiobookshelf account by a stored link,
  then by the same email address, and the SeerrNG owner (user 1) falls back to
  the Audiobookshelf root account.
- **Unfollow** removes only your tag while others still follow the show.
- The last follower is asked first: unfollowing (or removing the show from
  your shows) then deletes the show and its downloaded episodes from
  Audiobookshelf for everyone. Without that confirmation the server refuses
  with `409`.
- Shows nobody is tagged on (added before follows existed, or in
  Audiobookshelf directly) are visible to everyone; an hourly sweep gives them
  to the owner.
- Accounts that do not resolve to an Audiobookshelf user retain shared-library
  browsing behavior.
- A linked SeerrNG account sees its own followed shows and unclaimed shows.
  Direct item links use the same visibility rule for show details, episode
  availability, downloads, artwork, and activity; knowing an Audiobookshelf
  item ID does not grant access to another account's followed show. Played
  state is shown for the linked user's own listening progress.

## Limits

- Episodes are downloaded by Audiobookshelf; download errors are Audiobookshelf's.
- Charts come from Apple's public feeds and can be briefly unavailable; search
  and your shows keep working.
- Only one podcast library is used.
- Feeds, covers and episodes are read by SeerrNG, over a connection that
  refuses private, loopback and link-local addresses at connect time
  (redirects included). Audiobookshelf only ever gets signed SeerrNG proxy
  URLs (`/api/v1/podcast/proxy/...`) for shows SeerrNG adds: the feed it
  refreshes on its schedule, the cover and every episode it downloads. The
  feed it reads is rebuilt by SeerrNG and lists no other addresses. Proxy URLs
  are signed with `podcastProxySecret`, generated once in `settings.json`;
  keep it when restoring or moving settings, or shows already added stop
  updating.
- Shows added in Audiobookshelf directly (not through SeerrNG) keep their own
  feed addresses and are fetched by Audiobookshelf itself.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).
Podcast storage, downloads and playback are provided by
[Audiobookshelf](https://github.com/advplyr/audiobookshelf); charts by Apple
Podcasts' public feeds.

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
