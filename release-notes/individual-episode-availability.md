# Individual episode availability by source

TV season pages can now show episode files reported by Sonarr, Plex, Jellyfin,
and Emby. Badges identify the source and whether a standard or 4K copy was
reported. Sonarr uses TVDB order; each media-server TV library can be assigned
its TMDB or TVDB episode numbering order. SeerrNG only shows media-server
results when that order matches the selected TV or anime metadata provider.

Scans reconcile each source independently. Failed or incomplete scans retain
the last complete results, and file presence does not imply that an individual
user can access or play the file. See the
[setup guide](../docs/using-seerr/individual-episode-availability.md).

This is SeerrNG-specific work by snapetech and SeerrNG contributors. Proposal
sources and attribution are recorded in the [project notice](../NOTICE.md).
