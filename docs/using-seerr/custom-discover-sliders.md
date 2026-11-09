# Custom Discover sliders

Administrators can add a public TMDB list to Discover as a custom slider.

## Add a public TMDB list

1. Open **Discover** and choose **Customize Discover**.
2. Under **Create New Slider**, select **TMDB List**.
3. Enter a title and the numeric ID from the TMDB list URL, such as
   `https://www.themoviedb.org/list/1234567`.
4. Check the preview, then choose **Add Slider** and save the Discover layout.

The list must be public. Private lists require an owner account and cannot be
loaded by SeerrNG. List IDs must be positive decimal numbers of up to 12 digits.
SeerrNG stores the list ID and slider title; it does not ask for or store a TMDB
user token.

TMDB movies and series appear together in the order provided by the list. A
slider links to a paginated page for browsing the full list. The page follows
the enabled movie and series categories, and title cards show the library and
request state available to the signed-in user.

When you open a title from Discover and go back, each home slider returns to
its previous horizontal position so you can continue browsing where you left
off. This applies to default and custom sliders.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [Upstream Seerr PR #3607](https://github.com/seerr-team/seerr/pull/3607) — [@AintGotNoLoveToday](https://github.com/AintGotNoLoveToday).
- [Upstream Seerr PR #3608](https://github.com/seerr-team/seerr/pull/3608) — [@0xSysR3ll](https://github.com/0xSysR3ll).

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
