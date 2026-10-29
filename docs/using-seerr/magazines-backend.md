---
title: Magazines Backend
description: Configure LazyLibrarian for magazine discovery, requests, and issue status.
sidebar_position: 25
---

# Magazines Backend

SeerrNG handles magazine discovery, requests, permissions, quotas, and request
status. Configure [LazyLibrarian](https://lazylibrarian.gitlab.io/) in SeerrNG
to add requested titles and track downloaded issues.

## Configure LazyLibrarian

1. In LazyLibrarian, open **Config > Interface** and copy its API key. Use a
   write-enabled key; a read-only key cannot add magazines or start searches.
2. In SeerrNG, open **Settings > Services** and add a LazyLibrarian server.
3. Enter the LazyLibrarian host, port (usually `5299`), and API key, then test
   the connection.
4. If you configure multiple servers, mark one as the default. Requests use
   this instance unless an authorized requester selects another service.
5. Enable **Library Scan** to sync tracked magazines and issue availability
   into SeerrNG.

Set the magazine folder, download providers, and search behavior in
LazyLibrarian itself. The **Search automatically after approval** option in
SeerrNG starts a search for the requested title after an administrator approves
it (or immediately when the request is auto-approved).

## Discover and request titles

The **Tracked titles** catalog lists magazines already tracked by configured
LazyLibrarian instances. Global Search also has a **Magazines** category for
searching those tracked title catalogs. Enter a title to filter the results.

To search titles that are not already in LazyLibrarian, select **Public
catalog**. This searches Google's [Books API](https://developers.google.com/books/docs/v1/using)
with its magazine-only publication filter. An administrator must first create
an API key for public data in Google Cloud Console and save it in **Settings >
Main > Magazine Catalog > Google Books API Key**. The key stays on the server;
SeerrNG does not send it to browsers. Results include the title, publisher,
publication date, and cover when Google provides them. Google Books is a
discovery catalog; SeerrNG does not copy its records into the LazyLibrarian
library.

Requests and issue tracking still use LazyLibrarian. Configure at least one
LazyLibrarian service to submit a request from a public-catalog result. To
request a title manually from the tracked catalog, choose **Request Magazine**
and enter its title. Users with **Advanced Request** or **Manage Requests** can
choose which LazyLibrarian instance receives the request when multiple
instances are configured; other requesters use the default instance.

SeerrNG checks requests and availability by a normalized title, so requests
that differ only in case or repeated whitespace resolve to the same magazine.
The magazine details page shows issue dates and whether each issue has a file.
Magazine cards and details show the latest LazyLibrarian cover when one is
available.

SeerrNG's **Search > Releases** scope can query Prowlarr's configured magazine
categories for users with **Manage Requests**. Users can send a result to
Prowlarr's configured download client, without exposing a direct download URL
or creating a SeerrNG request. LazyLibrarian still performs acquisition for
approved magazine requests. Prowlarr may also sync indexers to LazyLibrarian,
but compatibility depends on its build. After syncing, confirm the providers
appear in LazyLibrarian and run a search there. See [Indexer searches by media
category](./indexer-searches.md).

Users can add magazines to a SeerrNG watchlist from magazine cards or details.
With **Auto-Request** and **Auto-Request Magazines** permission, enable
**Auto-Request Magazines** in your profile to submit a request when you add a
magazine to your watchlist. Users with **Manage Blocklist** can blocklist a
magazine from its card or details page, then find or remove it with the
**Magazines** filter on the Blocklist page.

Users with **Create Issues** can report a problem for an available tracked
magazine. Reports use the **Other** category with a structured reason for a
missing issue, wrong issue or date, damaged file, or incorrect metadata. The
reason is saved and shown on the issue card and details page. Users with
**View Issues** or **Manage Issues** can see open reports on magazine details
and use the magazine filter on the **Issues** page.

## Manage tracked magazines

Users with **Manage Requests** permission can open **Manage Magazine** from a
tracked title's details page. The panel shows its SeerrNG status, requests, and
known issues. Administrators can open the title in LazyLibrarian, mark it
available in SeerrNG, clear its SeerrNG tracking data, or remove it from both
LazyLibrarian and SeerrNG. Clearing tracking data also clears the related
requests. Removing a title from LazyLibrarian removes its magazine and issue
records, but leaves files on disk untouched.

## Permissions and quotas

Administrators can grant **Request Magazine**, **Auto Approve Magazine**, and
**Auto-Request Magazines** in user permissions. A global magazine request
limit can be set in **Settings > Users**. Administrators can override that
limit for an individual account in the user's **General** profile settings.
Users see their current usage in the request form and profile.

## Troubleshooting

Tracked magazine discovery is empty:

- Confirm that at least one LazyLibrarian server is configured in **Settings >
  Services**.
- Enable **Library Scan** and add or import magazine titles in LazyLibrarian.
- For a title not already tracked, enter its name with **Request Magazine**.

Public catalog search is unavailable:

- Add a Google Books API key in **Settings > Main > Magazine Catalog**.
- Confirm the Books API is enabled for the Google Cloud project and the key's
  restrictions allow SeerrNG's server to use it.
- Public catalog search needs a title query; it does not load an unfiltered
  magazine shelf.

Connection tests fail:

- Confirm the host, port, API key, SSL setting, and URL base match
  LazyLibrarian's configuration.
- Make sure SeerrNG can reach LazyLibrarian over the configured network.

## Current boundaries

- Google Books metadata is used for live public-catalog search results. The
  LazyLibrarian catalog remains the source for requests, issue dates, and file
  availability.
- LazyLibrarian controls the magazine folder and search settings globally.
  SeerrNG does not offer per-request folders or profiles.
- The LazyLibrarian API used here does not provide SeerrNG with individual
  in-progress magazine search cancellation or live download progress.
