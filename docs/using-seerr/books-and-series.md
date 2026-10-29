---
title: Books, Authors, and Series
description: Browse book catalogs, explore authors and series, and request book formats.
---

# Books, Authors, and Series

SeerrNG can search books through Open Library and the catalogs exposed by your
connected Bookshelf-compatible services. The available titles, editions,
authors, and series depend on those catalogs.

To accept both book and audiobook requests from one BookshelfNG instance, add
that instance twice in **Settings > Services**. Select **Books** on one
connection and **Audiobooks** on the other, then mark one default for each
format. Both connections can use the same address and API key.

## Browse and search

1. Open **Books** or **Audiobooks** from the navigation menu to browse that
   format.
2. Use the page search and filters to narrow results by title, publication
   year, subject, language, or rating.
3. To search across catalogs, open **Search**, enter a title or author, and
   choose **Books**, **Audiobooks**, or **Authors**.
4. Select a book to open its details. When the catalog supplies author or
   series information, the author and series names link to their own pages.

The **Audiobooks** page browses titles from configured Bookshelf-compatible
audiobook catalogs. Its narrator filter uses narrator metadata from those
catalogs, and audiobook searches do not mix in ebook-only Open Library results.

An author page lists books associated with that author. A book series page
lists its catalog volumes in series order when positions are available. Each
volume shows ebook and audiobook availability separately as **Available**,
**Requested**, or **Missing**.

## Request volumes from a series

On a series page, select **Request Missing Books** to open the multi-book
request dialog. Review the volumes and choose the book format and destination
for the titles you want. Normal request permissions, quotas, approval rules,
and service configuration still apply.

You can also open a volume's book details and request it individually. The
request dialog supports books, audiobooks, or both when matching services are
configured. To keep a particular edition, choose it in the edition selector;
see [Requesting a specific edition](./bookshelf-backend.md#requesting-a-specific-edition).
Book issue reports include reasons for missing content, a wrong edition,
damaged files, and incorrect metadata. The selected reason stays visible on
the issue card and details page, alongside the requester's explanation.

## Set language preferences

Preferred request languages can prioritize a matching book edition in the
request dialog. Users can set a default language and a separate book-language
override in their user settings. See
[Preferred Request Languages](./users/editing-users.md#preferred-request-languages)
for how those preferences affect requests.

## Configure book services

An administrator must connect a Bookshelf or other Readarr-compatible service
under **Settings > Services**. Configure a default service for each format you
want to offer. See the [Bookshelf backend guide](./bookshelf-backend.md) for
service setup and
[Bookshelf Metadata Sources](./bookshelf-metadata-sources.md) for catalog
behavior and provider-specific requirements.

SeerrNG also provides a permission-gated **Search > Releases** scope that can
query Prowlarr's configured ebook and audiobook categories. Those results are
for inspection only. Approved requests still use the configured
Bookshelf-compatible service for acquisition and tracking. Prowlarr may also
sync indexers to a compatible book service; confirm that service accepts and
uses the synced indexers. See [Indexer searches by media
category](./indexer-searches.md).
