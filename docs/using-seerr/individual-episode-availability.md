---
title: Track individual TV episode availability
description: Show which TV episodes have files in connected Sonarr and media-server libraries.
---

# Track individual TV episode availability

SeerrNG can show file-availability badges for individual episodes on a series'
season page. Badges identify whether a configured Sonarr, Plex, Jellyfin, or
Emby source reports the episode in its library, including standard and 4K
availability when **Enable 4K** is on.

This is a file-inventory signal. A Sonarr badge does not confirm that a media
server has indexed the file, and a Plex, Jellyfin, or Emby badge does not
confirm that a particular user can access or play it.

## Enable tracking

An administrator can enable **Track Individual Episode Availability** under
**Settings → General**. The setting is off by default. Enable the Sonarr or
media-server libraries that should be scanned.

Sonarr episode matching uses TheTVDB numbering, so select **TheTVDB** as the
metadata provider for the relevant TV or anime category. Sonarr tracking does
not use TMDB episode order.

For Plex, Jellyfin, or Emby, open the media-server settings and choose an
**Episode Numbering Order** for each TV library. Select **TMDB** or
**TheTVDB** only when it matches the episode order configured in that library.
Leave it as **Not Configured** if the library's order is unknown or uses a
different order. The library's choice must also match SeerrNG's selected
metadata provider for the series: the TV provider for regular series and the
anime provider for anime.

Run a full scan after enabling tracking or changing a library's episode order.
Episode indicators appear after a source has supplied a complete series scan.
Each source is reconciled independently. A complete scan can replace or clear
that source's records; failed, capped, or incomplete scans keep its last known
results. A source cannot clear another source's records. Disabling or removing
a library, changing its configured numbering order, or connecting a different
media server clears records associated with the retired source identity.

When **Enable 4K** is off, 4K results are not shown. Turning tracking off hides
episode availability and stops scanners from updating it; run a full scan
after turning it back on to refresh the displayed state.

## Read the episode indicators

On a series detail page, open a season to see its episode list. An **Available
· Sonarr**, **Available · Plex**, **Available · Jellyfin**, or **Available ·
Emby** badge identifies a source that reported the episode. A separate badge
ending in **4K** means that source also reported a 4K file.

Badges are aggregated by source type across the enabled, scanned libraries and
services. They do not identify a particular server or library. One episode may
have badges from several sources, and each source's records stay independent.

The episode list and source mapping follow the selected TV or anime metadata
provider. SeerrNG only attaches a media-server badge when the library's
configured numbering order matches that provider and a supported external
series ID and episode mapping are available. Unknown or ambiguous mappings are
left unmarked.

Tracking does not change request eligibility, season-level availability, or
per-user media-server permissions. It does not infer availability from watch
history or playback progress.

## Upstream context

This SeerrNG capability is an independently implemented adaptation of work
proposed in Seerr [PR #1671](https://github.com/seerr-team/seerr/pull/1671),
[PR #3355](https://github.com/seerr-team/seerr/pull/3355),
[PR #3361](https://github.com/seerr-team/seerr/pull/3361),
[PR #3527](https://github.com/seerr-team/seerr/pull/3527), and
[PR #3402](https://github.com/seerr-team/seerr/pull/3402). PR #3402 discusses
episode availability from media-server scanners; the SeerrNG implementation
adds explicit per-library episode-order configuration and keeps each source's
records independent during reconciliation.
