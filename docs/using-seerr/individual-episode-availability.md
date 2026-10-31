---
title: Track individual TV episode availability
description: Show which TV episodes have files in connected Sonarr libraries.
---

# Track individual TV episode availability

SeerrNG can record Sonarr file availability for each episode and show it on a
series' season page. This is an acquisition-library signal from Sonarr. It does
not confirm that a particular user can play the episode through Plex, Jellyfin,
or Emby.

## Enable tracking

An administrator can enable **Track Individual Episode Availability** under
**Settings → General**. It is off by default. Enable a Sonarr library scan for
the services whose files should be included, and select **TheTVDB** as the TV
metadata provider. For anime, select **TheTVDB** as the anime metadata provider
as well.

With tracking enabled, each scanned Sonarr service supplies an episode list for
each series. SeerrNG stores the service, season, episode number, and whether the
file belongs to the standard or 4K library. A resolution-aware single Sonarr
server reuses its existing detailed episode list when that scan has already
fetched one. Otherwise, tracking adds one episode-list request for that scanned
series. If the list cannot be confirmed complete, SeerrNG keeps the last
successful per-episode data.

The feature appears after a successful Sonarr scan. It does not change request
eligibility or the season-level availability state. With **Enable 4K** off,
4K episode availability is not shown.

## Read the episode indicator

On a series detail page, open a season to see its episode list. An episode
marked **Available · Sonarr** has a file reported by at least one enabled,
scanned Sonarr service. The indicator does not expose which service supplied
the file or imply that it is playable in a user's media-server account.

The list follows the selected TV or anime metadata provider's episode
numbering. SeerrNG attaches indicators when the Sonarr series uses the matching
TVDB order; alternate season orders and scene numbering are left unmarked until
their episode identities can be matched safely.

This capability adapts work discussed in Seerr [PR #1671](https://github.com/seerr-team/seerr/pull/1671),
[PR #3355](https://github.com/seerr-team/seerr/pull/3355), [PR #3361](https://github.com/seerr-team/seerr/pull/3361),
and [PR #3527](https://github.com/seerr-team/seerr/pull/3527). The current SeerrNG
implementation reads Sonarr file availability only. Related Plex and Jellyfin
scanner sources discussed in Seerr [PR #3402](https://github.com/seerr-team/seerr/pull/3402)
are not included.
