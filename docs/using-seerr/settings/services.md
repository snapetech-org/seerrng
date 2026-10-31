---
title: Services
description: Configure your default services.
sidebar_position: 4
---

# Services

:::info
**If you keep separate copies of non-4K and 4K content in your media libraries, you will need to set up multiple Radarr/Sonarr instances and link each of them to Seerr.**

Seerr checks these linked servers to determine whether or not media has already been requested or is available, so two servers of each type are required _if you keep separate non-4K and 4K copies of media._

**If you only maintain one copy of media, you can instead simply set up one server and set the "Quality Profile" setting on a per-request basis.**
:::

### Whisparr Settings

SeerrNG supports the scene-focused [Whisparr Eros v3 API](https://github.com/Whisparr/Whisparr-Eros).
Open **Settings → Services → TV & Movies → Whisparr Settings** and select
**Connect Whisparr Server**. Connect Whisparr to enable the opt-in Adult
category. Configure its indexers,
download client, and acquisition settings in Whisparr; SeerrNG sends approved
scene requests there and reads the queue and library when **Enable Library
Scan** is selected. See [Adult media](../adult-media.md) for setup,
permissions, and request quotas. The studio-focused Whisparr v2 API is not
supported.

### Radarr/Sonarr Settings

:::warning
**Radarr v3/v4 and Sonarr v3/v4 are supported. Sonarr 5.0 beta is supported through its v5 API.** SeerrNG detects each Sonarr server's version: v3 and v4 use the v3 API, while v5 uses the v5 API with per-endpoint fallback when a route is unavailable. The [v5 beta API](https://sonarr.tv/docs/api/?api=v5) may change before stable release; back up Sonarr before upgrading because downgrading requires restoring a v4 backup. See the [Sonarr v5 beta announcement](https://forums.sonarr.tv/t/sonarr-v5-beta/41099) for upgrade details. Radarr/Sonarr v2 is not supported.

Sonarr v5 adds request options for the series metadata language and, when the
series exposes more than one, its season order. These are advanced request
options and apply to the selected Sonarr server. Metadata language controls
Sonarr's series metadata; it is separate from an audio language profile. A
selected season order is retained with the request so season monitoring,
availability, and any manual season repair use the same numbering.

When a failed TV request needs manual season repair, the mapping dialog shows
the installed series' order, progress, anime identifiers, and recent history
when Sonarr v5 provides them. Standard-order seasons are checked against
official TVDB data. Alternate-order seasons are checked against the selected
Sonarr series, and the mapping stays scoped to that server and quality.
::::

#### Default Server

At least one server needs to be marked as "Default" in order for requests to be sent successfully to Radarr/Sonarr.

If you have separate 4K Radarr/Sonarr servers, you need to designate default 4K servers _in addition to_ default non-4K servers.

#### 4K Server

Only select this option if you have separate non-4K and 4K servers. If you have one enabled Radarr/Sonarr instance, leave this unchecked; SeerrNG uses the reported resolution of installed movie and episode files to keep HD and 4K availability separate.

#### Server Name

Enter a friendly name for the Radarr/Sonarr server.

#### Request Destination Label (optional)

Give a non-default instance a short label, such as **Anime** or **Kids**. Users
who are granted access will see the label and server name in the movie or
series request dialog. The default instance remains the normal destination and
does not need a label.

Select **Anime only** when the instance should accept anime titles only.
SeerrNG checks the title's TMDB anime keyword before showing the destination
and verifies it again when the request is submitted.

Manage access for each user under **Users → Edit → Permissions → Request
destinations**. This access is separate from advanced request permissions and
does not grant permission to change profiles, folders, or tags.

#### Hostname or IP Address

If you have Seerr installed on the same network as Radarr/Sonarr, you can set this to the local IP address of your Radarr/Sonarr server. Otherwise, this should be set to a valid hostname (e.g., `radarr.myawesomeserver.com`).

#### Port

This value should be set to the port that your Radarr/Sonarr server listens on. By default, Radarr uses port `7878` and Sonarr uses port `8989`, but you may need to set this to `443` or some other value if your Radarr/Sonarr server is hosted on a VPS or cloud provider.

#### Use SSL

Enable this setting to connect to Radarr/Sonarr via HTTPS rather than HTTP. Self-signed certificates are not trusted by default, but you can configure Seerr to accept them. See [Self-Signed Certificates](/using-seerr/advanced/self-signed-certificates) for details.

#### API Key

Enter your Radarr/Sonarr API key here. Do _not_ share these key publicly, as they can be used to gain administrator access to your Radarr/Sonarr servers!

You can locate the required API keys in Radarr/Sonarr in **Settings &rarr; General &rarr; Security**.

#### URL Base

If you have configured a URL base for your Radarr/Sonarr server, you _must_ enter it here in order for Jellyeerr to connect to those services!

You can verify whether or not you have a URL base configured in your Radarr/Sonarr server at **Settings &rarr; General &rarr; Host**. (Note that a restart of your Radarr/Sonarr server is required if you modify this setting!)

#### Profiles, Root Folder, Minimum Availability

Select the default settings you would like to use for all new requests. Note that all of these options are required, and that requests will fail if any of these are not configured!

Sonarr also supports a separate **Anime Quality Profile**. SeerrNG checks the
selected profile when you save the service settings and rejects it if the
connected Sonarr server confirms that the profile is missing. If Sonarr cannot
be reached during the save, the settings are retained so you can repair the
connection. When an approved anime request is sent, SeerrNG verifies the
selected anime profile again and falls back to that same Sonarr service's
default profile if the anime profile is missing or cannot be verified. The
Services list shows the configured anime profile beneath the standard profile.

#### Default Metadata Language and Season Order (Sonarr v5)

After testing a Sonarr v5 connection, choose **Default Metadata Language** and
**Default Season Order** for newly added series. **Automatic (from Sonarr)**
uses the lookup metadata language, falling back to original language and then
English when necessary. You can instead select a specific metadata language;
this does not select an audio language.

The season order defaults to **Aired Order**. **Automatic (from Sonarr)** uses
the lookup's selected order, falling back to Aired Order. Alternate orders such
as DVD or absolute order remain available per request when the series supports
them. A request's explicit language or order takes priority over these server
defaults. Requests for series already in Sonarr preserve their language and
order unless an explicit request override changes them.

These controls are hidden for Sonarr v3/v4, which retain their existing language
profile behavior. Existing settings need no migration.

#### Monitor New Seasons (Sonarr)

Choose how Sonarr should monitor future seasons when SeerrNG adds a series:

- **All** monitors future seasons for every requested series.
- **None** leaves future seasons unmonitored.
- **Latest Season Requested** monitors future seasons only when the request includes the latest regular season listed by TMDB. Specials do not count as regular seasons, and requests for older seasons alone do not enable future-season monitoring.

This setting controls monitoring only. Automatic searches are controlled separately by **Enable Automatic Search**. If SeerrNG cannot identify a regular season, it uses **None** for that request.

#### External URL (optional)

If the hostname or IP address you configured above is not accessible outside your network, you can set a different URL here. This "external" URL is used to add clickable links to your Radarr/Sonarr servers on media detail pages.

#### Enable Scan (optional)

Enable this setting if you would like to scan your Radarr/Sonarr server for existing media/request status. It is recommended that you enable this setting, so that users cannot submit requests for media which has already been requested or is already available.

To show file availability for each TV episode, enable **Track Individual
Episode Availability** under **Settings → General** and use TheTVDB as the
selected TV or anime metadata provider. See [individual episode availability](../individual-episode-availability.md)
for the scan and display details.

#### Enable Automatic Search (optional)

Enable this setting to have Radarr/Sonarr to automatically search for media upon approval of a request.

#### Requester Tags (optional)

When enabled, SeerrNG adds a tag for the requester to each movie or series sent
to Radarr or Sonarr. If a temporary tag lookup or creation error occurs, SeerrNG
still sends the request with the server's configured tags and any tags selected
for that request. The requester tag is skipped for that dispatch, and SeerrNG
logs a warning.

### ChaptarrNG / Bookshelf Settings

Use SeerrNG as the request portal for your household. People request books in
SeerrNG; the connected book service handles acquisition, downloads, imports,
and its own metadata and search settings. Household users do not need accounts
in ChaptarrNG or Bindery.

| Backend | Best fit |
| --- | --- |
| ChaptarrNG or another Readarr-compatible service | You already use its library and profile controls. Configure indexers, download clients, profiles, and search behavior in that service; SeerrNG sends the selected book and format. |
| Bindery | You want SeerrNG to submit book requests to Bindery’s request queue and follow approval, download, import, and availability. Configure acquisition defaults in Bindery. |
| BookOrbit | SeerrNG connects it as a reader app for existing library files, shelves, OPDS, and Kobo sync. BookOrbit’s separate Requests feature is not connected to SeerrNG. |

SeerrNG connects to ChaptarrNG, BookshelfNG, and other Readarr-compatible book
backends through this shared settings section. No environment variable is
needed on the SeerrNG container. For ChaptarrNG 0.9.941+, set
`CHAPTARR__AUTH__SEERRAPIKEY` on the ChaptarrNG container and enter that key in
the service form.

One ChaptarrNG or BookshelfNG instance can manage ebooks and audiobooks in the
same library. SeerrNG keeps ebook and audiobook routing separate, so add a
service entry for each format you enable and mark one as the default for that
format. Both entries can use the same backend URL and API key; this does not
require two ChaptarrNG or BookshelfNG instances.

Each BookshelfNG author can optionally set separate ebook and audiobook
folders for future imports, upgrades, and renames. Existing files are not moved
when an override changes. Authors can also set format-specific quality and
metadata profile overrides; each format falls back to the author's shared
profile when its override is unset. Use separate BookshelfNG instances only
when you need isolated databases or different settings for the same author.

Use the [Bookshelf Backend](/using-seerr/bookshelf-backend) guide for the
recommended ChaptarrNG Docker Compose deployment. Hardcover is the default for
new deployments, while existing Goodreads/softcover and other compatible
metadata sources remain supported. Migration is optional.

Administrators can [preview and move ebook or audiobook paths](/using-seerr/bookshelf-media-path-migration)
inside one BookshelfNG database. This tool does not merge split Bookshelf
databases.

If you choose to switch providers, use the
[Bookshelf Hardcover Migration](/using-seerr/bookshelf-hardcover-migration)
runbook. Provider IDs are not portable; the runbook rebuilds records and can
preserve strict matches, recover metadata, and create local records for books
the target provider cannot import.

### Bindery

Bindery uses its own API, so add it through **Add Bindery Server** instead of
the Readarr-compatible connection form. SeerrNG can send approved ebook and
audiobook requests, optionally use one Bindery service for both formats, and
scan Bindery's imported library for availability. Configure search and library
defaults in Bindery. **Test connection** reports whether Bindery supports
per-user requests and how many Bindery accounts are available for matching.
Enable Bindery's **Auto-approve requests** option for each requester who
should not need a second approval after a SeerrNG request is approved. SeerrNG
shows approval and download progress for its own Bindery requests, and it
withdraws a request on cancellation only while that Bindery request is still
pending. See the [Bindery Backend guide](/using-seerr/bindery-backend) for
identity matching and lifecycle details.

### Audiobookshelf availability

Under **Settings → Services → Audiobookshelf Availability**, you can connect
one Audiobookshelf book library to recognize audiobooks already in your
collection. Use an Audiobookshelf user token that can view the selected
library. SeerrNG matches items to its book catalogue by ISBN; items without an
ISBN are skipped. A match counts as an available audiobook only and does not
block an ebook request.

This is an inventory connection, not an acquisition service. SeerrNG does not
add, remove, monitor, or edit Audiobookshelf items. The selected library is
scanned with the Bookshelf availability job, and you can add an external URL to
make matched items clickable from book details. See the
[Bookshelf Backend](../bookshelf-backend.md#audiobookshelf-availability)
guide for the connection behavior and limitations.

### Sportarr

Connect Sportarr under **Settings → Services → Sportarr**. SeerrNG checks the
connection, loads Sportarr's quality profiles, and uses the default connection
when dispatching approved sports requests. Sportarr controls its own root
folder and monitoring defaults. See the [Sportarr guide](../sportarr.md) for
setup, permissions, quotas, and event status.

## Override Rules

Override rules can assign a root folder, quality profile, or tags when a movie
or series request matches selected requester and media conditions. Matching
rules are also applied in **Advanced Options** for movie and series requests,
where you can review the resulting values before submission. See the
[Override Rules guide](/using-seerr/override-rules) for setup and matching
behavior.

## Reader Apps

**Settings → Services → Reader Apps** connects Grimmory or BookOrbit to your
existing library for OPDS browsing, with additional comic and audiobook options
depending on the service. Grimmory is selected by default. Administrators can
also create live author and series shelves from detail pages and manage those
shelves here. See the [reader delivery guide](/using-seerr/reader-delivery) for
setup, supported formats, Kobo behavior, and device downloads.
