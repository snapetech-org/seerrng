# Discover

Discover provides shared shelves for browsing movies, series, books, and other
media. Administrators can change which shelves appear and how they are ordered
from the edit control on the Discover page.

## Customize the Networks Shelf

The built-in Networks shelf can be tailored for everyone using the server.

1. Open **Discover** and select the edit control.
2. Find **Networks** and select **Edit**.
3. Enter a TMDB network ID and select **Add Network**. The network must have a
   TMDB logo to appear in the shelf.
4. Use the move controls to change the order, or remove entries you do not want.
5. Select **Save Networks** to apply the list to the shared Discover page.

The shelf supports up to 50 networks. **Reset to Default List** restores the
original SeerrNG list in the editor; select **Save Networks** to apply it.
Removing every entry and saving leaves the shelf empty.

## Movie and Series Catalog Pages

Movie and series catalogs follow the page count returned by TMDB, so a page
with fewer results than usual does not end the list. If a later catalog page
fails, SeerrNG retries that page once. If it fails again, that one page is
skipped and browsing continues; a failure on the first page or immediately
after a skipped page is shown as an error so it can be retried. A skipped page
can leave a gap in the results for that visit.

The failed-page recovery is SeerrNG's scoped adaptation of [Seerr issue
#3654](https://github.com/seerr-team/seerr/issues/3654) and [Seerr PR
#3656](https://github.com/seerr-team/seerr/pull/3656). SeerrNG already followed
TMDB's reported page count; this adds recovery for an isolated page failure to
the movie and series catalogs.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [Upstream Seerr issue #3304](https://github.com/seerr-team/seerr/issues/3304) — [@qelijahq](https://github.com/qelijahq).
- [Upstream Seerr PR #3305](https://github.com/seerr-team/seerr/pull/3305) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3434](https://github.com/seerr-team/seerr/pull/3434) — [@britsync07-prog](https://github.com/britsync07-prog).
- [Upstream Seerr issue #3591](https://github.com/seerr-team/seerr/issues/3591) — [@simpat1zq](https://github.com/simpat1zq).
- [Upstream Seerr PR #3607](https://github.com/seerr-team/seerr/pull/3607) — [@AintGotNoLoveToday](https://github.com/AintGotNoLoveToday).
- [Upstream Seerr PR #3608](https://github.com/seerr-team/seerr/pull/3608) — [@0xSysR3ll](https://github.com/0xSysR3ll).
- [Upstream Seerr issue #3654](https://github.com/seerr-team/seerr/issues/3654) — [@kitchjp](https://github.com/kitchjp).
- [Upstream Seerr PR #3656](https://github.com/seerr-team/seerr/pull/3656) — [@fallenbagel](https://github.com/fallenbagel).

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
