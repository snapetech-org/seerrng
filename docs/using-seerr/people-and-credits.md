# Browse and sort person credits

Select a cast or crew member on a movie or series page to open that person's
SeerrNG page. The page groups credits for the same title and lets you choose
whether to show all credits, movies, or TV series. The **Sort credits** control
applies the same order to both the cast and crew lists.

Available sort fields are popularity, release date, rating, vote count, and
title. Each field can be sorted in either direction. Titles use your selected
interface language's collation rules. The default is vote count, highest
first. When a provider has not supplied the selected value, that credit stays
after credits with known values rather than being treated as a zero, an old
release, or an empty title. Sorting and media type filtering apply to the
loaded person credits; they do not change request permissions or submit
requests.

This SeerrNG capability was developed with reference to the open Seerr
[person-credit sorting pull request #3342](https://github.com/seerr-team/seerr/pull/3342).

## People in Lumen All search

In the included Lumen interface, choose **Search**, select **All**, and enter an
actor's, director's, or other person's name. Matching people appear in a
separate **People** section alongside Movies, Series, and Books when those
categories are available. Profile cards show an image when one is supplied.

Open a person to see their biography and up to 24 distinct movie and TV
credits in Lumen; choose a credit to open the normal title details. The person
and credit data use existing TMDB-backed SeerrNG APIs; server-side maturity
limits are applied to credits. People aren't included in Movies-only or
Series-only search. Lumen doesn't yet offer the native credit-sorting controls.

A signed-in Lumen account and working TMDB metadata access are required.
If a person or credits lookup fails, choose **Retry**. This feature doesn't
change request permissions, available titles, or native interface settings.

This Lumen UI adapts a previous private People-search implementation using
SeerrNG's existing person APIs and presentation components.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [Upstream Seerr PR #3342](https://github.com/seerr-team/seerr/pull/3342) — [@zjgoodman](https://github.com/zjgoodman).
- [Upstream Seerr issue #3499](https://github.com/seerr-team/seerr/issues/3499) — [@indigokarasu](https://github.com/indigokarasu).

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
