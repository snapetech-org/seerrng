# Movie and series Discover filters

Use the Movie or Series Discover filters to narrow TMDB results by release
details, genre, rating, language, and streaming availability. Filter choices
are stored in the page URL and can be copied with the URL.

## Filter by TMDB rating

Choose **TMDB Rating** and select a minimum score in tenths, such as **7.5+**.
The score is TMDB's title vote average. Existing links with whole-number
thresholds continue to work.

When sorting by TMDB rating, SeerrNG uses a minimum vote count to keep titles
with very few votes from dominating the results. Choose **Minimum TMDB Votes**
to change that limit or include titles with any vote count.

## Sort by title

Movie title sorting uses TMDB's original-title field; Series title sorting uses
its original-name field. The selected sort stays in the page URL, so copied
Discover links keep the same ordering. Local HD and 4K availability results
sort by their indexed title metadata when title sorting is selected.

## Include or exclude streaming services

1. Open **Streaming Services**.
2. Choose a **Region** and select one or more services.
3. Set **Match selected services** to **Include selected services** to show
   titles TMDB lists on any selected service, or **Exclude selected services**
   to hide titles TMDB lists on those services.

The filter uses the selected region for either mode. Changing the region clears
the current service selection. Clear all selected services to remove the
filter.

Selections apply to the current discovery or contextual search URL; they do not
change another user's settings.

## Exclude genres

Select a genre, then choose **Exclude Genres** to hide titles with that genre.
Choose the button again to include the selected genre. Genre exclusions work
for Movie and Series Discover, including title searches and local availability
results whose stored metadata includes genres.

## Exclude a movie studio

Choose a studio on Movie Discover, then choose **Exclude Studio** to hide
movies associated with that studio. Studio exclusions use TMDB's movie
discovery filter and are not available for local availability results.

## Exclude a series status

Choose one status on Series Discover, then choose **Exclude Status** to hide
series with that status. TMDB returns the other supported status categories, so
ordinary Discover pagination remains provider-driven.

## Local availability

Local HD and 4K results use SeerrNG's stored availability records. Genre
filters can use their stored genre metadata. Studio, streaming-service, and
series-status selections are cleared when you switch to local availability;
the notice above the filters explains which selections were removed.

When your Plex, Jellyfin, or Emby account is linked to SeerrNG, local results
are checked against the media items and seasons visible to that account. Titles
whose access cannot be verified are omitted. See
[per-user movie and TV availability](./media-server-access.md) for the account
requirements and troubleshooting steps.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [Upstream Seerr issue #206](https://github.com/seerr-team/seerr/issues/206) — [@xoniq](https://github.com/xoniq).
- [Upstream Seerr PR #626](https://github.com/seerr-team/seerr/pull/626) — [@wjh000123](https://github.com/wjh000123).
- [Upstream Seerr issue #898](https://github.com/seerr-team/seerr/issues/898) — [@Joly0](https://github.com/Joly0).
- [Upstream Seerr issue #1269](https://github.com/seerr-team/seerr/issues/1269) — [@RDLN7](https://github.com/RDLN7).
- [Upstream Seerr issue #3090](https://github.com/seerr-team/seerr/issues/3090) — [@sveinbjornpalsson](https://github.com/sveinbjornpalsson).
- [Upstream Seerr PR #3154](https://github.com/seerr-team/seerr/pull/3154) — [@u61d](https://github.com/u61d).
- [Upstream Seerr PR #3166](https://github.com/seerr-team/seerr/pull/3166) — [@TheReaperJay](https://github.com/TheReaperJay).
- [Upstream Seerr issue #3304](https://github.com/seerr-team/seerr/issues/3304) — [@qelijahq](https://github.com/qelijahq).
- [Upstream Seerr PR #3305](https://github.com/seerr-team/seerr/pull/3305) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3584](https://github.com/seerr-team/seerr/pull/3584) — [@Hugisko](https://github.com/Hugisko).

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
