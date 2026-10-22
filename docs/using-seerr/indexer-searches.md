---
title: Indexer searches by media category
description: Connect Prowlarr to SeerrNG for manual category-aware indexer searches and understand how approved requests reach media managers.
---

# Indexer searches by media category

Administrators can connect one Prowlarr instance under **Settings > Prowlarr**.
SeerrNG then provides **Indexer Search** for users with
**Manage Requests** permission. The page searches Prowlarr directly across
movies, TV, music, ebooks, audiobooks, comics, magazines, adult scenes, retro
ROMs, modern ROMs, and PC games. Adult search appears only when the Adult
category is enabled and Whisparr is configured.

Search results are private by default: indexer names and details links appear
only when the administrator allows them globally and the user's settings allow
them. Search results never contain torrent, NZB, or download URLs. A user can
send a result to Prowlarr's configured download client with **Send to
downloader**. This is a manual handoff; it does not create a SeerrNG request or
change request status. Approved requests still go to their configured media
manager or software provider, which owns acquisition, import, and progress
tracking.
This configuration supports Prowlarr only; NZBHydra2 is not currently
supported as a SeerrNG indexer-search provider.

| SeerrNG category | Title discovery in SeerrNG | Manual Prowlarr search | Approved request acquisition |
| --- | --- | --- | --- |
| Movies | TMDB | Configured movie category IDs | Radarr |
| TV | TMDB | Configured TV category IDs | Sonarr |
| Music | MusicBrainz and music metadata sources | Configured audio category IDs | Lidarr |
| Ebooks | Open Library, Bookshelf catalogs, and book metadata providers | Configured ebook/book category IDs | BookshelfNG, Chaptarr, or another configured book service |
| Audiobooks | Book metadata catalogs and configured Bookshelf catalogs | Configured audiobook/audio category IDs | BookshelfNG, Chaptarr, or another configured book service |
| Comics | ComicVine | Configured comic/book category IDs | Mylar3 or API-compatible Issuarr, Kapowarr, or BackIssue using its configured sources |
| Magazines | Google Books public catalog or titles tracked by LazyLibrarian | Configured magazine/book category IDs | LazyLibrarian |
| Adult scenes | Whisparr scene lookup | Configured XXX category IDs | Whisparr |
| Retro and Modern ROMs | IGDB through the selected catalog provider (QuestarrNG by default, or ROMarrNG), matched to ROMarrNG systems | Configured console/game category IDs | ROMarrNG |
| PC games | IGDB through QuestarrNG | Configured PC/game category IDs | QuestarrNG |

## Configure Prowlarr

1. Open **Settings > Prowlarr** as an administrator.
2. Enter the Prowlarr hostname, port, optional base path, SSL setting, and API
   key. The API key stays on the SeerrNG server and is masked after saving.
3. Select **Test connection and inspect coverage**. SeerrNG checks its Prowlarr
   management API connection, then tests each enabled searchable indexer with
   at most four concurrent checks. The results separate a management API
   failure from an individual feed failure, including HTTP status and any
   Prowlarr cooldown dates, before showing category coverage. These checks
   contact the configured providers but do not grab or download releases.
4. Review **Category filters** and save. Defaults use the standard movie, TV,
   audio, book, console-generation, and PC-game categories. Prowlarr's broad
   Audio category can include audiobooks; select narrower music categories if
   you want to keep those results separate. The broad PC category can also
   include non-game software; select PC/Games for a narrower search. Your
   Prowlarr indexers can report custom category IDs, which appear after a
   successful connection test. Use **Add detected matches** to select custom
   categories whose advertised names clearly match a medium, then review and
   save the mappings. Ambiguous category names are left for you to map
   manually.
5. Under **Indexer assignments**, select which enabled, searchable Prowlarr
   indexers can serve each SeerrNG media category. Clear a category's selection
   to disable manual searches for that category. Set the overall per-user
   searches-per-minute limit and optional per-indexer limits under **Search
   limits**.
6. Use **Show indexer names and details to users** to allow indexer identity
   globally. When enabled, you can hide indexer details for selected users from
   their **General** settings. When disabled, details stay hidden even if a
   user has a saved preference to show them.

The **Retro ROMs**, **Modern ROMs**, and **PC games** filters start with
generation-specific standard console categories and the broad PC category.
Prowlarr's standard console list ends at PS4 and Xbox One; newer
systems such as PS5, Switch 2, and Xbox Series may use custom categories.
After testing the connection, add the matching categories shown by Prowlarr to
the relevant SeerrNG filter. SeerrNG does not infer a console generation from
a game's title.

Coverage counts are an estimate based on the categories each enabled indexer
advertises. A nonzero count does not guarantee that an indexer returns results
for a particular title or that a media manager can import a release. A zero
count means the selected category IDs do not match any enabled searchable
indexer in the current inventory.

If an indexer reports `401 Unauthorized`, SeerrNG reached Prowlarr but that
indexer's feed request was refused. Check the indexer's credentials in
Prowlarr, then repeat the diagnostic. A management API `401` means the saved
Prowlarr API key or address is wrong, so SeerrNG cannot read the indexer list.

## Search indexers

Users with **Manage Requests** open **Indexer Search** from the navigation,
select a media category, enter at least two search characters, and choose
**Search indexers**. Results show release title, protocol, size, seeders and
leechers when provided, publish date, and categories. If indexer details are
allowed for that user, results also show the source name and a safe HTTP or
HTTPS details link. Sensitive query parameters are removed from the link.
Choose **Send to downloader** to hand the selected result back to Prowlarr;
Prowlarr sends it to the download client configured for that indexer. The
server keeps the release identifier private and never returns a direct download
link to the browser.

Movie, TV, music, and book searches use Prowlarr's corresponding format-aware
search types; comics, magazines, ROMs, and PC games use category-filtered
general search. **Search Prowlarr** actions on supported media detail pages
open this page with the title and category filled in. Book details preserve the
selected ebook or audiobook format. These shortcuts are available to users
with **Manage Requests** permission.

Searches are limited to 50 results per page. Administrators can set a
per-user-per-minute limit and optional per-indexer limits. **Load more
results** requests another page. A manual handoff does not create or update a
SeerrNG request; it only sends the chosen result through Prowlarr.

For Adult scenes, SeerrNG uses Prowlarr's standard XXX category (`6000`) for
manual searches. A user can manually send a result to Prowlarr's configured
download client. Approved Adult requests remain Whisparr-managed and tracked.
See [Adult media](./adult-media.md) for setup.

## Keep request acquisition separate

Prowlarr can also sync compatible indexers to supported applications. That
sync is useful to Radarr, Sonarr, Lidarr, and whichever book or comic services
accept the relevant Prowlarr integration. After syncing, check the destination
application's indexer and search settings. Some providers do not support
Prowlarr or use direct-download sources instead.

For an approved SeerrNG request, the configured media manager or software
provider continues to perform its own search, grab, import, and tracking. A
manual Prowlarr handoff is separate: it sends a user-selected result to the
configured download client without creating or changing a SeerrNG request.

See the setup guides for [books and audiobooks](./bookshelf-backend.md),
[comics](./comics-backend.md), [magazines](./magazines-backend.md), and
[ROMs and PC games](./software-acquisition.md). Prowlarr documents its
supported application integrations and category-based indexer management in
the [Prowlarr README](https://github.com/Prowlarr/Prowlarr) and
[quick-start guide](https://github.com/Servarr/Wiki/blob/master/prowlarr/quick-start-guide.md).
