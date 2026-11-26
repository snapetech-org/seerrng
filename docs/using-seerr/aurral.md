---
description: Connect Aurral as your all-in-one music acquisition service for full albums and single tracks.
---

# Aurral

[Aurral](https://github.com/lklynet/aurral) is a self-hosted music manager that handles album discovery, downloading, library management, and single-track downloads without requiring Lidarr or slskdN.

When Aurral is configured in SeerrNG, it integrates directly into Music requests and single-track requests:

- **Albums & Artists**: Request full albums from artist/album pages or artist discographies. Aurral manages quality, profiles, and folder placement automatically.
- **Single Tracks**: Single-track requests (from album track lists, playlist imports, or Track Requests) route automatically to Aurral instead of slskdN.
- **Availability & Scanning**: Approved album requests track live searching, downloading, and importing status, and the daily **Aurral Scan** job keeps SeerrNG's album and track availability in sync with your Aurral library.

:::info
If Aurral is not configured, Lidarr and slskdN continue to handle album and single-track requests exactly as before.
:::

## Prerequisites

1. Create or choose an **Aurral user account** in your Aurral instance.
2. Sign in as that user and open **Settings > Profile > API access** in Aurral to generate a **per-user API key**.

:::warning
Do **not** use an Aurral admin-only key. Aurral's user-data endpoints (`/api/library/albums/request`, `/api/library/downloads/track`, and `/api/requests`) reject admin keys with HTTP `403` and require a user API key so requests are attributed to a user.
:::

## Adding Aurral in SeerrNG

1. Open **Settings > Services > Music** (in Classic UI, or **Administration > Music > Aurral Services** in Lumen).
2. Click **Add Aurral Server**.
3. Enter your **Server Name**, **Hostname or IP Address**, **Port** (for example `3001`), **URL Base** if Aurral runs under a subpath, and **External URL** if you want browser links to open Aurral externally.
4. Paste the **per-user Aurral API Key**.
5. Click **Test** to verify connectivity (`GET /api/health` confirms both server version and the authenticated Aurral user).
6. Enable **Use for music requests by default** if you want Aurral to handle album requests by default, and enable **Keep SeerrNG availability in sync** to enable the daily library scan and live request tracking.
7. Save the server.

## Recommended Aurral setup

SeerrNG works with stock Aurral 3.0.1 and later; every endpoint it calls is
part of Aurral's own API. These settings make the music pages work best:

- **Use a per-user API key** for an Aurral user that may request music (see
  Prerequisites). Requests show up in Aurral under that user.
- **Turn on single-track downloads in Aurral** if people should be able to
  get one song (**Get song**). Without them, album requests still work and
  SeerrNG hides the song buttons.
- **Enable Keep SeerrNG availability in sync** so album and song states (In
  library, Requested, Downloading) stay current between the daily scan and
  live request tracking.
- **Set the External URL** if people should open Aurral's player from Lumen
  (**Play**, **Open in Aurral**).
- **Give Aurral reliable metadata.** Artist pages, release dates and the
  album/single grouping come from Aurral's MusicBrainz metadata. If lookups
  are slow or time out, a self-hosted Lidarr-compatible metadata server for
  Aurral makes these pages much faster and steadier.

### Known Aurral 3.0.1 issues

These are Aurral problems, not SeerrNG ones, but they show up in SeerrNG's
music pages. Until a fixed Aurral release is available, this is what you may
see:

| What you see in SeerrNG | Cause in Aurral 3.0.1 |
| --- | --- |
| Albums show no release year; classic albums sort as newest. | Aurral returns no album release date. |
| Some albums or covers are missing on artist pages. | Albums by collaborations, or not linked to the artist, are not matched; no cover fallback when Cover Art Archive has none. |
| An album request fails at once instead of retrying. | When an album's track list is not available yet, Aurral fails the request instead of asking to retry later (SeerrNG retries a 503 with Retry-After). |
| The same song downloads again and again. | Album tracks that already have their song are queued again. |
| Mixes fetch songs where the artist only features. | Mix tracks are not limited to songs the seed artist leads. |
| A requested song downloads alone and its album is not added. | Song requests do not bring their album (studio albums, EPs and singles). |

## How Requests Work

- **Album requests**: Users request an album without selecting Lidarr quality profiles, metadata profiles, or root folders. SeerrNG sends the MusicBrainz release-group MBID and metadata to `POST /api/library/albums/request` and tracks progress through `GET /api/library/albums/:albumId/status`.
- **Single-track requests**: Users can request individual missing tracks from an album's track list, from **Track Requests**, or from unmatched items during **Playlist Imports**. SeerrNG sends `albumMbid`, track duration (`durationMs`), and track metadata to `POST /api/library/downloads/track`, or marks the track completed immediately if Aurral reports `alreadyOwned`.
- **Playlist imports**: Matched tracks create album requests through Aurral (when it is the default music service); unmatched or single tracks queue directly as Aurral single-track downloads.

## Music in Lumen

With Aurral (or Lidarr, see below) configured, people with music request
permission get Lumen's music pages instead of the MusicBrainz catalog browser (which stays one
tap away under **Browse catalog**). Everything below goes through SeerrNG; Lumen
never talks to Aurral directly.

- **Discover**: new releases, trending songs and albums, recommended artists,
  "Because you listen to…" rows seeded from your library, curated playlists and
  genres. It shows only things to discover, not what you already have.
- **Search**: one box for artists, albums and songs, with a top result, an
  **In your library** row, and support for pasted music and playlist links
  (Spotify, Deezer and YouTube). When a song is the top result, its album leads the albums
  row.
- **Artist pages**: "You have X of Y albums", **Get missing** (a plan that skips
  singles whose songs come with an album anyway), top songs with previews, and
  **Follow** (Aurral monitoring for new releases; needs music auto-approve).
- **Album pages**: every song with a preview and **Get song**, owned songs with
  **Play**, and **Get album** or **Get the N missing songs** for a part-owned
  album.
- **Library**: albums and artists from Aurral, with sorting and a name filter.
- **Activity**: your requests, downloads in progress, recent downloads, and
  downloads that failed with Aurral's reason. A failed album request can be
  tried again.
- **Play** opens the song or album in Aurral's player (or the player chosen
  under **Play opens in**).

### With Lidarr instead of Aurral

Without Aurral, the same pages run on the default (non-4K) Lidarr server, so
any SeerrNG install with Lidarr gets them. Aurral wins when both are set up.
What comes from where:

- **Library**, **Activity** and **Follow** come from Lidarr: albums with at
  least one track file (owned or part-owned from Lidarr's track counts),
  Lidarr's queue and history (with the failure message for failed imports and
  downloads), and following, which sets the artist to monitor new releases
  (adding the artist, without searching for old albums, when it is not in
  Lidarr yet). Unfollowing stops new releases and keeps everything already
  requested.
- **Artist pages** come from ListenBrainz and MusicBrainz, **Search** from
  Lidarr's lookups plus Deezer for songs, and **Discover** (charts, genres,
  recommended artists, playlists) and **previews** from Deezer.
- **Requests** use Lidarr as before: album pages keep the MP3/FLAC choice and
  **Request discography**, instead of Aurral's **Get album**.
- **Play** opens Plex search (Lidarr has no player); people can change this
  under **Play opens in**.

Not available on Lidarr: per-song requests and owned-song lists (Lidarr does not
list single songs), and the "already covered by an album you have" hints.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).
Music acquisition, the library and playback are provided by
[Aurral](https://github.com/lklynet/aurral); previews and some artwork come from
Deezer's public API.

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
