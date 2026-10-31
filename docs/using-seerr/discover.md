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
