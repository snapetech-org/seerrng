---
title: Bookshelf Backend
description: Configure ChaptarrNG for new installs and maintain legacy BookshelfNG services.
sidebar_position: 21
---

# Bookshelf Backend

This guide documents the legacy BookshelfNG backend for existing installations.
New SeerrNG deployments should use ChaptarrNG, documented below. The
Bookshelf-specific Hardcover and Goodreads guidance remains useful during
migration: provider IDs are source-specific, so changing a legacy library's
metadata source requires rebuilding its metadata records rather than changing
only the URL or image.

For the exact distinction between runtime metadata and migration-only
recovery, plus Google Books, Library of Congress, Apify, caching, IDs, and
future provider candidates, see [Bookshelf Metadata Sources and Migration
Recovery](./bookshelf-metadata-sources.md).

For BookshelfNG's SeerrNG-specific API behavior, see
[BookshelfNG interoperability](#bookshelfng-interoperability).

As of 2026-10-31, BookshelfNG `0.4.21.76` and ChaptarrNG `v0.9.977` remain the
latest public releases; ChaptarrNG `main` is
`fa55ffabe632c7ee003791635ebe53fb1895d3df`, with latest application source
snapshot `bd589312`. ChaptarrNG `v0.9.977`
includes single-database SQLite preview, conversion, and rollback tools in
the standard product. ChaptarrNG PR
[#183](https://github.com/snapetech-org/chaptarrng/pull/183) merged at
`96c953b2`; its migration handoff uses the ordinary ChaptarrNG product and
does not create a compatibility image. Follow-up main commits retain the
legacy Docker port contracts. The PR's exact merge-head Build
[#41168525352](https://github.com/snapetech-org/chaptarrng/actions/runs/41168525352)
is waiting and is not current application-source validation; main and
standalone platform/archive jobs remain queued at older source. No exact-head
pass for application source `bd589312` or current `main` `fa55ffab` is recorded
here. Migration apply remains frozen pending feature, migration, rollback,
and installation-channel acceptance. No legacy package, image, installer,
updater, or chart identity has been redirected.

The current source-path audit compares BookshelfNG `1bd7f2dc` with ChaptarrNG
`main` target `fa55ffab` (application source `bd589312`): 1,174 changed paths,
56 reviewed mappings, 587 dispositions, and 587 paths without a final
disposition. Those are
source-review counts, not missing-feature counts or SeerrNG acceptance
evidence. The merged PR #183 changes are included in the target snapshot. See
the [pinned consolidation audit](https://github.com/snapetech-org/bookshelfng/blob/main/docs/maintainers/chaptarr-consolidation.md#exact-head-source-path-audit--2026-10-31).

Keep the existing BookshelfNG database and installation in service until the
[feature, migration, and distribution gates](https://github.com/snapetech-org/bookshelfng/blob/main/docs/maintainers/chaptarr-consolidation.md)
pass. Closing BookshelfNG issue #144 did not close those gates or authorize
cutover. Each BookshelfNG capability, data/configuration path, rollback path,
and channel remains an individual blocker. The later ChaptarrNG-to-Chaptarr
gate is separate and cumulative: all BookshelfNG features carried over plus
every ChaptarrNG maintained, active, or unreleased capability blocks
retirement. See the [combined ChaptarrNG retirement matrix](https://github.com/snapetech-org/chaptarrng/blob/main/docs/FORK_FEATURES.md#chaptarrng-retirement-gates).

## One BookshelfNG instance for both formats

One BookshelfNG instance and database can manage ebooks and audiobooks on the
same book record. SeerrNG keeps format routing separate, so add two connections
in **Settings > Services > Audiobooks & Books** when you want both formats: set
one to **Book** and the other to **Audiobook**, and point both entries to the
same backend URL and API key. The entries let SeerrNG route each format; they
are not separate backend instances.

This applies to existing legacy installations only. For new deployments, use
the [ChaptarrNG service](#chaptarrng). In SeerrNG's **Configure Services**
step, add a **Book** connection, then choose **Use this instance for
Audiobooks** to create the second service entry with the same connection
details. Select its root folder and profiles before saving.

The migration helper refuses split databases until a separate library merge
has been completed and verified; changing the two SeerrNG URLs alone does not
merge them. Running the legacy installer with existing data previews the
BookshelfNG-to-ChaptarrNG migration by default.

Each BookshelfNG author can optionally set different ebook and audiobook
folders in the author editor. These overrides apply to future imports,
upgrades, and renames; existing files are not moved automatically. Authors can
also set format-specific quality and metadata profile overrides. Each format
falls back to the author's shared profile when its override is unset. Separate
BookshelfNG instances are optional when you need isolated databases or
different settings for the same author.

### BookshelfNG interoperability

Current BookshelfNG builds publish `/api/v1/system/capabilities` with the
versioned `seerrng-bookshelf` contract. SeerrNG checks that response and, when
available, routes ebook and audiobook service requests through the matching
`/readarr/{gr|hc}/{format}/api/v1` path, where `gr` and `hc` identify the
provider-ID dialect. Older BookshelfNG versions keep using the standard
Readarr API path. Both routes reach the same BookshelfNG database and library;
the facade carries the configured format context without creating separate
authors, books, or databases. Format-specific profile overrides are applied
when configured, with author-level profiles as the fallback.

Newer BookshelfNG builds include separate ebook and audiobook file counts in
each book's statistics. SeerrNG uses the count for the selected service type,
so having an ebook no longer makes an audiobook request appear available. The
scanner falls back to Readarr's aggregate file count when those fields are not
present.

On BookshelfNG builds that support a dedicated SeerrNG key, operators can set
`BOOKSHELF_SEERRNG_API_KEY` from a container or Kubernetes secret and use it in
both SeerrNG service entries. This credential
is limited to BookshelfNG status/capability, library/search, tag,
quality/metadata-profile and root-folder, queue, book-file, book-history, and
command-status reads; author/book add or update operations; and a `BookSearch`
command for one book at a time. It cannot manage API keys or system settings,
run other commands, or delete authors or files. The global BookshelfNG API key
remains supported for existing clients. Older BookshelfNG builds should
continue to use the global API key.

[ChaptarrNG](https://github.com/snapetech-org/chaptarrng) is Snapetech's maintained
fork of [Chaptarr](https://github.com/Chaptarr/chaptarr), supported as a
Readarr-compatible alternative. We maintain the fork because SeerrNG needs
format-scoped requests and durable tracking when author metadata preparation
delays a book add. ChaptarrNG remains a standalone app. SeerrNG sends the
selected format explicitly, so one ChaptarrNG instance can serve ebooks and
audiobooks without a provider-specific URL Base or API adapter. See the
[ChaptarrNG fork feature guide](https://github.com/snapetech-org/chaptarrng/blob/main/docs/FORK_FEATURES.md)
for its maintained changes, including Direct Download, backup protection,
and package support.

### ChaptarrNG

Configure ChaptarrNG in **Settings > Services** as a Bookshelf server. Its
system-status response identifies the app as `Chaptarr` so SeerrNG's
Readarr-compatible detection continues to work:

1. Add one service entry for each format you want to request. Set **Book
   Format** to **Book** or **Audiobook** to match the ChaptarrNG root folder and
   profiles selected below it.
2. Use ChaptarrNG's normal host, port, and API key. Leave **URL Base** blank
   unless you deliberately configured a URL Base in ChaptarrNG.
3. Select the format-specific root folder, quality profile, and metadata
   profile returned by the connection test.
4. Enable **Scan** after saving. Enable **Automatic Search** if approvals
   should start a ChaptarrNG search.

When SeerrNG and ChaptarrNG run in separate containers, connect them through a
shared Docker network and use the ChaptarrNG service name and container port,
for example `http://chaptarrng:8789`. Do not use `localhost` from SeerrNG's
container. ChaptarrNG's Compose example publishes its host port on loopback by
default; container-to-container requests can use the shared network without a
host port publication. For separate Compose projects, create the network once
with `docker network create media-services`, then add the following network
declaration and service attachment to both Compose files (adjust service names
as needed):

```yaml
services:
  chaptarrng:
    networks: [media-services]

networks:
  media-services:
    external: true
```

For a single ChaptarrNG instance that manages both formats, create two SeerrNG
service entries with the same connection details and different **Book Format**
values. Mark one entry of each format as the default. A **Both** request then
dispatches once to each entry.

SeerrNG sends ChaptarrNG the requested book identity and selected-book
monitoring intent. ChaptarrNG may still create unmonitored catalogue rows for
other books by the same author; only the requested format/book is marked for
monitoring. This is normal ChaptarrNG behavior, not evidence that SeerrNG
approved those other books.

### ChaptarrNG interoperability

SeerrNG sends each ChaptarrNG Bookshelf service through the matching ebook or
audiobook API facade. It reads ChaptarrNG's `/system/capabilities` contract to
choose the provider-ID dialect, format facade, paged library contract,
provider-scoped edition identity, and pending-import support. Older versions
without a supported contract fall back to the existing Hardcover-setting
check and legacy route assumptions. Keep both SeerrNG service entries on the
same ChaptarrNG instance when it manages both formats, and select the matching
format in each entry.

For ChaptarrNG `0.9.941` and later, configure a dedicated SeerrNG service key
with `CHAPTARR__AUTH__SEERRAPIKEY` in the ChaptarrNG container or secret
manager. Enter that value in the Bookshelf service's **API Key** field. The
scoped key supports SeerrNG's book lookup, library, request, search, and
pending-author-import operations, and its artwork requests. It does not grant
global settings, book or author deletion, file deletion, or media-move access.
Keep the normal ChaptarrNG API key separate for administrators and older
integrations.

| Operation | SeerrNG behavior |
| --- | --- |
| Search and edition selection | Uses format-scoped lookups, retains the provider's work and edition IDs, and falls back to native lookup results when a format facade has no addressable result. |
| Library scan | Reads paged, format-scoped results when advertised, including unmonitored catalogue rows. It follows ChaptarrNG's reported total even when a page is short, and refuses to return a scan known to be incomplete. |
| Add and search | Sends the selected format and monitoring intent. When ChaptarrNG queues author metadata preparation, SeerrNG stores the pending import and resumes the requested book add and search when it is ready. |
| Request cancellation | Cancels the pending author import only when no other active request on the same ChaptarrNG instance references it. The check includes both SeerrNG ebook and audiobook service entries. For completed adds, normal book and queue cleanup applies. |
| Request status | Shows when ChaptarrNG is preparing the author, including retry count and the next scheduled retry when available. |
| Settings diagnostic | A normal diagnostic checks the connection, profiles, folders, and lookup. The optional `testAdd` API flag performs a real add and removes the local book afterward. If ChaptarrNG returns a pending import, the diagnostic displays its ID and leaves it queued because that import may also serve an active request. Check the import in ChaptarrNG and cancel it only if no request needs it. |

The `testAdd` diagnostic is an API option; the Settings modal's **Run
Diagnostic** button does not enable it. Use it only when you intend to exercise
the add endpoint and can review any provider-side work it queues.

When ChaptarrNG accepts an add with `202 Accepted` while it prepares author
metadata, SeerrNG keeps the request waiting and resumes the selected format's
add and search after ChaptarrNG reports that import complete. SeerrNG retains
the provider work and edition IDs for that request, so it can restore tracking
if ChaptarrNG assigns the local book a different row ID. Cancelling a waiting
request checks for active references across both format entries when they point
to the same ChaptarrNG instance, and cancels the pending author import only
when no other request depends on it.

The ChaptarrNG integration contract and restricted service key are covered by
tests in both repositories. ChaptarrNG's repeatable Compose smoke starts a
disposable BookshelfNG migration-158 fixture against a locally built candidate
image, verifies normal-startup conversion, checks that SeerrNG reads both
migrated formats through the format-scoped API, verifies the restricted-key
boundary, and exercises a pending request lifecycle. It uses synthetic
placeholder media and does not establish operator-data or M4B processing
acceptance. Run it with the instructions in
[ChaptarrNG's SeerrNG integration guide](https://github.com/snapetech-org/chaptarrng/blob/main/docs/SEERRNG_INTEGRATION.md).
Pin the ChaptarrNG image version in reproducible deployments because its
Readarr-compatible surface can change between releases.

### Troubleshoot a missing or failed ChaptarrNG book

Start with the request's current status and history in SeerrNG. SeerrNG records
the request, format, service destination, and the lifecycle information the
backend exposes. It does not copy raw service logs into requester-facing
status because those can include server paths or other private details.

For a search or download issue, have an administrator check the matching
ebook or audiobook service entry, then inspect the book in ChaptarrNG:

1. Confirm the requested title and format are monitored. Seeing the author in
   ChaptarrNG does not mean the requested title is monitored; other books from
   that author may be catalogued without being searched.
2. Run an interactive search for that exact book in ChaptarrNG and review the
   selected metadata, profile, and root folder.
3. Check ChaptarrNG's indexer results, download client, activity, and logs to
   see whether a release was found, sent to the client, and imported. If you
   use Prowlarr, confirm its enabled indexers and credentials are healthy from
   ChaptarrNG's side as well.
4. If you copied a file into the library yourself, use ChaptarrNG's manual
   import to identify and organize it, then run SeerrNG's book availability
   scan.

Household members can keep requesting in SeerrNG; they do not need accounts in
ChaptarrNG, Prowlarr, or the download client. These tools remain administrator
integrations. SeerrNG cannot improve a backend's source coverage or change its
search profile, so use the backend's diagnostics and logs when results are
missing.

## Audiobookshelf availability

SeerrNG can scan one Audiobookshelf book library as a separate,
inventory-only audiobook source. Connect it under **Settings → Services →
Audiobookshelf Availability**, test the connection, and select a book library.
Use an Audiobookshelf user token with permission to view that library. The scan
matches items to SeerrNG's book catalogue by ISBN; entries without an ISBN
cannot be linked automatically. Matching items count as available audiobooks
only, so an audiobook in Audiobookshelf does not block an ebook request.

This connection is read-only: SeerrNG does not add, remove, monitor, or modify
Audiobookshelf items. It does not dispatch acquisition requests to
Audiobookshelf. The Bookshelf scan reads the selected library and removes stale
availability links only after a complete scan, so transient API or pagination
failures do not mark a library as empty. An optional external URL makes the
matching Audiobookshelf item clickable from book details.

If a ChaptarrNG lookup is empty, first verify that the selected **Book Format**
has a writable root folder and matching quality/metadata profiles. If the
connection test succeeds but diagnosis reports incomplete metadata, check the
ChaptarrNG metadata provider and retry the lookup from its UI.

## Deployment Policy

### New SeerrNG book deployments

Use ChaptarrNG for every new SeerrNG ebook or audiobook deployment. One
ChaptarrNG instance serves both formats; create one SeerrNG service entry for
**Book** and one for **Audiobook**, both pointing to that instance. The standard
image is `ghcr.io/snapetech/chaptarrng:latest`. The setup assistant can create
the stack:

```bash
node scripts/setup-assistant.mjs --profile books --output ./my-books-stack
```

ChaptarrNG is standalone. It does not require BookshelfNG, Hardcover,
rreading-glasses, PostgreSQL, or BookLore. BookLore is an optional external
BookDrop destination for imported files, not a required dependency or a
replacement for ChaptarrNG's library database. See ChaptarrNG's
[BookLore integration guide](https://github.com/snapetech-org/chaptarrng/blob/main/docs/BOOKLORE_INTEGRATION.md).
Follow the [ChaptarrNG service setup](#chaptarrng) and its
[migration guide](https://github.com/snapetech-org/chaptarrng/blob/main/docs/MIGRATE_FROM_BOOKSHELFNG.md)
when replacing an existing BookshelfNG instance.

### Existing BookshelfNG installations

BookshelfNG is legacy-only while migration and feature/channel gates remain
open. Keep a verified backup and continue running it until the ChaptarrNG
conversion and each integration are checked. The SeerrNG installer refuses a
fresh BookshelfNG install. When it finds an existing BookshelfNG data directory,
it previews conversion to ChaptarrNG by default; it does not start or configure
the new service for you.

Run an explicit preview against the same standard ChaptarrNG image that a new
installation uses:

```bash
BOOKSHELF_EBOOKS_CONFIG_DIR=/path/to/bookshelf-config \
  deploy/install-bookshelf-backend.sh --migrate-to-chaptarrng
```

If a source book has no edition rows, or a monitored mixed-format book has no
selected edition, preview stops and leaves the database unchanged. It writes
`readarr.db.bookshelf-media-review.json` beside the database with the affected
source IDs and why the format cannot be inferred. Set each `mediaType` to
`audiobook`, `ebook`, or `both`, save the completed document as
`readarr.db.bookshelf-media-map.json` in the same directory, and rerun preview.
The helper prints this next step when it finds the review file. For books
without editions, the choice selects the destination media record or records;
for monitored mixed-format books, it selects which formats to monitor while
preserving all editions and files. On Unix, the review file is owner-readable
only because it contains library titles and author names.

Review the per-table report. Stop every BookshelfNG process using that database,
then apply only after confirming the data directory and a separate backup
location:

```bash
BOOKSHELF_EBOOKS_CONFIG_DIR=/path/to/bookshelf-config \
BACKUP_DIR=/path/to/private-backups \
  deploy/install-bookshelf-backend.sh --migrate-to-chaptarrng --apply --confirm-stopped
```

Apply writes an independent config archive and the converter keeps the original
`readarr.db`. The published `v0.9.977` helper accepts one supported SQLite
source database and refuses PostgreSQL, pre-migration-14 databases, and split
ebook/audiobook databases. PR #131 contains an unpublished older-schema and
single-schema PostgreSQL candidate; neither is approved for operator use.
The helper does not start ChaptarrNG or rewrite a Compose file. Point the regular
ChaptarrNG service at the converted config directory and preserve media/download
mounts, the saved port and URL base, and any environment-only credentials.
Check the library and SeerrNG requests before removing the old deployment.

The old BookshelfNG installer remains available only for explicit maintenance
and recovery with `--legacy-bookshelf`. The metadata-source conversion to
Hardcover is a separate legacy Bookshelf operation documented in the
[Hardcover migration runbook](./bookshelf-hardcover-migration.md); it is not
part of moving BookshelfNG into ChaptarrNG. Distribution-channel bridges are
not published, so package, image, and installer transitions still need their
own tested path.

## Legacy Bookshelf metadata context

The legacy `lscr.io/linuxserver/readarr` backend can be reachable and still
return unusable `/api/v1/book/lookup` records. A bad lookup usually has a title
and a foreign book ID, but no author object and no editions. SeerrNG refuses to
add those raw records because Bookshelf/Readarr can reject them or create broken
library entries.

For legacy BookshelfNG installations that remain in service, Hardcover is the
preferred metadata path. The old `softcover` backend with `rreading-glasses`
remains available for Goodreads-compatible metadata, and other
Readarr-compatible provider endpoints can be configured through the same
service API. This legacy metadata choice does not change ChaptarrNG as the
recommended backend for new SeerrNG deployments. Goodreads no longer issues new public developer API keys, so
Goodreads support here is mediated by the configured Bookshelf-compatible
provider rather than a direct SeerrNG Goodreads client.
Goodreads' own developer notice says it no longer issues new public API keys;
the [Goodreads Developers notice](https://www.goodreads.com/group/show/8095-goodreads-developers)
therefore makes a Bookshelf-compatible provider the practical way to retain
Goodreads metadata support. SeerrNG uses provider-native author images returned
by Bookshelf when Open Library has no author photo.

## Architecture

BookshelfNG is the legacy Readarr-style application for existing deployments.
One instance manages both ebook and audiobook files, downloads, imports, file
organization, and the Readarr-compatible API that SeerrNG calls. When both
request formats are enabled, SeerrNG has two service entries pointing to that
same instance.

The bundled installer is legacy-only. Its default behavior with an existing
BookshelfNG database is to preview the move into ChaptarrNG; it refuses a fresh
BookshelfNG install. The old two-process deployment remains supported only in
explicit legacy maintenance mode. ChaptarrNG is the target for new installs.

A single instance uses one metadata catalog selection and one author-level
profile set. Each author uses one default path and can optionally set separate
ebook and audiobook folder overrides.

rreading-glasses is a metadata compatibility/proxy layer: it exposes the
metadata API BookshelfNG expects, translates requests to Hardcover, caches
results in PostgreSQL, and coalesces/rate-limits upstream work. Metadata has
three deliberate deployment modes:

| Mode | Bookshelf metadata path | rreading-glasses | Use it when |
| --- | --- | --- | --- |
| `compatibility` (legacy Bookshelf installer default for Hardcover) | BookshelfNG → local rreading-glasses → upstream | On, with PostgreSQL | A shared durable cache, centralized throttling, or a compatibility boundary |
| `native` (explicit opt-in) | BookshelfNG → Hardcover GraphQL | Off | The shortest direct Hardcover path |
| `hosted` | BookshelfNG → `METADATA_URL` such as `https://hardcover.bookinfo.pro` | Off | Native credentials are unavailable or a hosted compatibility endpoint is preferred |

Compatibility is the legacy installer default because it keeps BookshelfNG decoupled
from Hardcover's GraphQL API and centralizes Hardcover authentication, caching,
request coalescing, and upstream throttling. One proxy and PostgreSQL cache can
serve a single combined BookshelfNG instance or several isolated instances.
Existing local proxy installs are detected and preserved on rerun.

Native remains an explicit alternative when the shortest direct path is more
valuable than the shared proxy boundary. Select it with
`BOOKSHELF_METADATA_MODE=native`.

Choose runtime fallback catalogs and enter provider credentials on each
BookshelfNG instance under **Settings > Metadata**. That page also manages the
native Hardcover token when no environment token is set. SeerrNG's own
**Settings > Metadata** page selects TMDB or TVDB for video metadata; its book
catalog panel directs administrators to the connected BookshelfNG settings,
where catalog choices take effect.

### Native Hardcover failure behavior

Native mode intentionally has no hidden runtime failover. The request path is:

1. BookshelfNG checks its in-process metadata cache.
2. On a miss, it sends the GraphQL request directly to Hardcover using
   `HARDCOVER_AUTH`.
3. A successful response is mapped into BookshelfNG's normal metadata models
   and cached for later lookups.
4. If native mode is disabled, the same application falls back to
   `METADATA_URL`; switching to hosted or compatibility mode is explicit and
   visible in `.env`.

This avoids a partially working deployment that silently changes providers or
duplicates requests during an outage. The tradeoff is that native mode does
not provide rreading-glasses' durable cross-instance cache. A fresh search or
refresh still needs Hardcover, and an operator must select compatibility mode
if persistent proxy caching is required.

### Compatibility-mode outage behavior

In compatibility mode, rreading-glasses provides the older shared path:

1. BookshelfNG calls the local rreading-glasses endpoint on port `8790`.
2. rreading-glasses checks its in-memory cache and then its PostgreSQL-backed
   cache on localhost port `15433`.
3. Cached author, work, edition, or series responses can be served without a
   fresh upstream call until their cache lifetime expires.
4. A cache miss, expired entry, or free-text search still needs the configured
   upstream. The proxy is not an unlimited offline mirror.

The shared cache can serve one or more Bookshelf instances and survives a proxy
restart when its PostgreSQL volume is healthy. It also adds two local failure
points: the proxy and its database. If either is unavailable, connected
instances lose this metadata path. There is no automatic runtime failover from
Hardcover to Goodreads or OpenLibrary in either mode.

During a compatibility-mode outage, keep rreading-glasses and
`RREADING_GLASSES_POSTGRES_DIR` intact. The installer backs up that directory
when it exists. The proxy readiness check proves only that the local process is
serving; use `--validate-api`, an actual lookup, and the proxy logs to verify
upstream recovery.

For compatibility mode, provide `HARDCOVER_AUTH` with the `Bearer ` prefix;
the token is used by rreading-glasses. Native mode passes it to BookshelfNG.
Create a token in [Hardcover account API settings](https://hardcover.app/account/api).
Hosted mode does not require a local token for metadata, although Bookshelf's
own Hardcover list-import settings still need an API key when that feature is
used.

For Goodreads/softcover mode, provide a Goodreads cookie via `COOKIE` if your
upstream requires one.

If Bookshelf is reachable but searches return no books, run the installer's
`--validate-api` check and inspect the lookup response, not just the TCP
connection test. Hardcover mode requires `HARDCOVER_AUTH` with the `Bearer `
prefix; softcover mode requires the Goodreads `COOKIE` when the upstream asks
for it.

BookshelfNG supports ebook and audiobook files for the same book in one
instance. SeerrNG needs a default service entry for each format enabled, and
both entries can point to the same BookshelfNG instance.

## Repository and Image

The public Snapetech fork is:

```text
https://github.com/snapetech-org/bookshelfng
```

If Docker is not an option, follow the [BookshelfNG source-build
guide](./bookshelf-source-build.md) to compile and run the backend directly on
Linux.

The deployment compose defaults to the Snapetech image:

```text
ghcr.io/snapetech/bookshelfng:hardcover
```

The installer and deployment Compose file use the stable `hardcover` tag.
BookshelfNG updates that tag only from its `main` release workflow, so SeerrNG
does not consume `develop` images by default. Set `BOOKSHELF_IMAGE` to a full
digest reference when reproducible upgrades and rollbackability matter more
than automatic adoption of the newest main release.

That image is built from the public `bookshelfng` fork and provides the native
Hardcover metadata backend. Fresh installs use the local rreading-glasses
compatibility path by default; set `BOOKSHELF_METADATA_MODE=native` to pass
`HARDCOVER_AUTH` directly to BookshelfNG. To force the legacy softcover path,
set `BOOKSHELF_BACKEND=softcover`; this switches the image to the stable
`ghcr.io/snapetech/bookshelfng:softcover`
and keeps compatibility mode.
Softcover deployments use `COOKIE` when the Goodreads upstream requires it.

The image is published from GitHub Actions in the `snapetech/bookshelfng`
repository:

```bash
docker pull ghcr.io/snapetech/bookshelfng:softcover
```

If a pull returns `denied`, the package exists but is not anonymously readable.
Make it public in GitHub under **Packages > bookshelfng > Package settings >
Change visibility**, or authenticate Docker with a token that can read packages.
As a temporary fallback, set
`BOOKSHELF_IMAGE=ghcr.io/pennydreadful/bookshelf:softcover`; SeerrNG can hydrate
upstream softcover lookup results that contain `foreignEditionId` but return an
empty `editions` array.

## Known Good Versions

The validated SeerrNG backend migration build was:

```text
seerrng:bookshelf-fix-20260518f
```

The validated BookshelfNG fork includes these changes:

```text
bde894431 Return author and editions from book lookup
c416ad1af Add image publish workflow
d7dc505f8 Skip CI for documentation-only changes
0d600a564 Guard null Hardcover edition sub-objects
fd8abff6b Add sparse Hardcover metadata regression tests
5788f7c1c Pin patched transitive dependencies
```

Use the stable `ghcr.io/snapetech/bookshelfng:softcover` image for softcover
once the GHCR package is public or the Docker host is authenticated. If you
need a fully anonymous pull before that package visibility is corrected, use
`ghcr.io/pennydreadful/bookshelf:softcover` and rely on SeerrNG's softcover
hydration fallback.

## Paths

Keep the same media and download mount paths that download clients and Plex
already know about. If these paths change, imports and hardlinks can break.

The example compose uses:

```text
/data      -> media root
/download  -> download root
/downloads -> media root compatibility mount
/plex      -> Plex library root
/media/plex -> Plex library root compatibility mount
```

For the validated deployment, the important in-container paths were:

```text
/data/plex/books
/download/books
```

## Installer Script

> **Migration is frozen for now.** ChaptarrNG `v0.9.977` is the latest
> published release. BookshelfNG issue #144 is closed, but feature parity,
> representative data and rollback, and installation-channel acceptance remain
> open. Use the migration helper for read-only preview only. Do not pass
> `--apply` or start ChaptarrNG against BookshelfNG appdata. Keep the existing
> BookshelfNG service running until the retirement gates close.

For a new deployment, use the SeerrNG setup assistant to create the standard
ChaptarrNG stack:

```bash
node scripts/setup-assistant.mjs --profile books --output ./my-books-stack
```

The legacy BookshelfNG installer is not a fresh-install path. With an existing
BookshelfNG database it defaults to a non-mutating ChaptarrNG preview. To run it
explicitly, set the source config path:

```bash
BOOKSHELF_EBOOKS_CONFIG_DIR=/path/to/bookshelf-config \
  deploy/install-bookshelf-backend.sh --migrate-to-chaptarrng
```

When preview finds records without an identifiable media type, it creates
`readarr.db.bookshelf-media-review.json` beside `readarr.db` and exits without
promoting a database. Fill each `mediaType` with `audiobook`, `ebook`, or
`both`, save the completed document as `readarr.db.bookshelf-media-map.json`,
and rerun preview before applying. The same standard ChaptarrNG image reads
that map during preview, apply, and normal startup.

After all retirement gates pass and production cutover is explicitly approved,
review the report, stop BookshelfNG, and apply with an independent backup location:

```bash
BOOKSHELF_EBOOKS_CONFIG_DIR=/path/to/bookshelf-config \
BACKUP_DIR=/path/to/private-backups \
  deploy/install-bookshelf-backend.sh --migrate-to-chaptarrng --apply --confirm-stopped
```

The helper archives the config before applying and does not start ChaptarrNG or
rewrite the deployment. Preserve the existing port and URL base, media/download
mounts, and environment-only credentials when pointing the standard ChaptarrNG
service at the converted config. Split databases and unsupported schemas are
refused; keep the old deployment and backup until the target is verified.

Use `--legacy-bookshelf` only to maintain or restore an existing BookshelfNG
installation. The following manual BookshelfNG Compose, metadata, and rollback
instructions are for those existing installs only. They do not apply to fresh
SeerrNG deployments.

## Manual Compose for legacy BookshelfNG maintenance

Use the included compose file if you prefer manual setup:

```bash
mkdir -p /opt/bookshelf-backend
cp deploy/compose.bookshelf.yml /opt/bookshelf-backend/compose.yml
cd /opt/bookshelf-backend
```

Create `/opt/bookshelf-backend/.env`:

`PUID` and `PGID` are numeric IDs on the Docker host, not account or group
names. The values below are examples and may not match your host. To map an
existing account, run `id -u accountname` and `id -g accountname` on the host,
replacing `accountname` with that user. These report the user's UID and primary
GID. If the media directories use a shared group, run `getent group groupname`
and use that group's numeric GID instead. Copy the numeric values into `.env`;
do not put names or shell expressions there. The `/config` mount must be
writable, and Bookshelf must have the required read/write access to its media
mounts.

After changing these IDs, recreate both Bookshelf containers from
`/opt/bookshelf-backend` so Compose applies the new values:

```bash
docker compose up -d --force-recreate bookshelf-ebooks bookshelf-audiobooks
```

```env
PUID=1000
PGID=953
TZ=America/Regina

BOOKSHELF_BACKEND=hardcover
BOOKSHELF_IMAGE=ghcr.io/snapetech/bookshelfng:hardcover
BOOKSHELF_METADATA_MODE=compatibility
BOOKSHELF_METADATA_URL=http://127.0.0.1:8790
BOOKSHELF_HARDCOVER=true
BOOKSHELF_HARDCOVER_NATIVE=false
BOOKSHELF_HARDCOVER_AUTH=
BOOKSHELF_EBOOKS_CONFIG_DIR=/mnt/datapool_lvm_media/readarr-config
BOOKSHELF_AUDIOBOOKS_CONFIG_DIR=/mnt/datapool_lvm_media/bookshelf-audiobooks-config

MEDIA_ROOT=/mnt/datapool_lvm_media
DOWNLOAD_ROOT=/mnt/datapool_lvm_media/download
PLEX_ROOT=/mnt/datapool_lvm_media/plex

COMPOSE_PROFILES=rreading-glasses
HARDCOVER_AUTH=Bearer your-hardcover-api-token-here
RREADING_GLASSES_UPSTREAM=api.hardcover.app
RREADING_GLASSES_IMAGE=blampe/rreading-glasses:hardcover@sha256:3489e722a73c9cbab5b9ba530cf8a60c2280367fb03db1fb649261dfb064b52f
RREADING_GLASSES_POSTGRES_DIR=/mnt/datapool_lvm_media/rreading-glasses-postgres/data
RREADING_GLASSES_POSTGRES_PASSWORD=replace-with-a-long-random-password
```

For explicit native mode, use the same file with these metadata settings and a
token passed directly to BookshelfNG:

```env
BOOKSHELF_METADATA_MODE=native
BOOKSHELF_METADATA_URL=https://hardcover.bookinfo.pro
BOOKSHELF_HARDCOVER_NATIVE=true
BOOKSHELF_HARDCOVER_AUTH=Bearer your-hardcover-api-token-here
COMPOSE_PROFILES=
HARDCOVER_AUTH=Bearer your-hardcover-api-token-here
```

For Goodreads/softcover compatibility mode, use:

```env
BOOKSHELF_BACKEND=softcover
BOOKSHELF_IMAGE=ghcr.io/snapetech/bookshelfng:softcover
BOOKSHELF_METADATA_MODE=compatibility
BOOKSHELF_METADATA_URL=http://127.0.0.1:8790
BOOKSHELF_HARDCOVER_NATIVE=false
COMPOSE_PROFILES=rreading-glasses
RREADING_GLASSES_IMAGE=blampe/rreading-glasses:latest@sha256:dd996a1db19ac4ef18df47f1671f608c0f097ed43c4776ebde94dee20c6b43c8
RREADING_GLASSES_UPSTREAM=www.goodreads.com
COOKIE=your-goodreads-cookie-here
RREADING_GLASSES_POSTGRES_PASSWORD=replace-with-a-long-random-password
```

Start the stack:

```bash
docker compose pull
docker compose up -d
```

For a manually configured legacy BookshelfNG setup, each config directory needs a
different port in `config.xml` before both containers run on host networking:

```xml
<!-- ebook config.xml -->
<Port>8787</Port>

<!-- audiobook config.xml -->
<Port>8788</Port>
```

If both instances bind `8787`, only one container can start successfully.

## Backups

Before replacing Readarr or moving config directories, back up:

- ebook Bookshelf/Readarr config directory,
- audiobook Bookshelf config directory, if it already exists,
- rreading-glasses Postgres data directory, if it already exists.

Example:

```bash
backup_dir=/mnt/datapool_lvm_media/backups/readarr-bookshelf-$(date +%Y%m%d-%H%M%S)
mkdir -p "$backup_dir"
tar -C /mnt/datapool_lvm_media -czf "$backup_dir/readarr-config.tgz" readarr-config
tar -C /mnt/datapool_lvm_media -czf "$backup_dir/bookshelf-audiobooks-config.tgz" bookshelf-audiobooks-config
```

Do not delete the old backup after first boot. Keep it until ebook, audiobook,
and both-format requests have been tested through SeerrNG.

## SeerrNG Configuration for One BookshelfNG Instance

In **Settings > Services > Audiobooks & Books**, open **ChaptarrNG / Bookshelf
Settings** and add two connections that point to the same BookshelfNG host,
port, and API key. The **Add ChaptarrNG Server** button also accepts BookshelfNG
and other Readarr-compatible backends. This keeps SeerrNG's format routing
separate while BookshelfNG stores both formats in one library.
To reorganize files inside that combined database, use the admin-only
[Bookshelf media path mover](./bookshelf-media-path-migration.md). It previews
the file moves and requires confirmation before BookshelfNG queues them.

Book service:

```text
Hostname: kspls0, 127.0.0.1, or the Docker host name reachable by SeerrNG
Port: 8787
API Key: the BookshelfNG instance's API key
Book Format: Book
Quality Profile: a profile present in this BookshelfNG instance
Root Folder: /data/plex/books
Default Server: enabled
Enable Scan: enabled
Enable Automatic Search: your policy
```

Audiobook service:

```text
Hostname: kspls0, 127.0.0.1, or the Docker host name reachable by SeerrNG
Port: 8787
API Key: the same BookshelfNG instance's API key
Book Format: Audiobook
Quality Profile: a profile present in this BookshelfNG instance
Root Folder: /data/plex/books
Default Server: enabled
Enable Scan: enabled
Enable Automatic Search: your policy
```

Use the same API key from **Bookshelf > Settings > General > Security** for
both service entries. Authors can optionally set separate ebook and audiobook
folders and format-specific quality and metadata profile overrides. An unset
override falls back to the author's shared profile. Select compatible defaults
in each entry. The entries can use different endpoints if you deliberately
operate isolated instances.

## Metadata Source

The combined BookshelfNG instance can use:

```text
http://127.0.0.1:8790
```

Verify with:

```bash
curl -H "X-Api-Key: BOOKSHELF_API_KEY" \
  http://127.0.0.1:8787/api/v1/config/development
```

Both responses should include:

```json
{
  "metadataSource": "http://127.0.0.1:8790"
}
```

## Lookup Validation

Run these against the Docker host:

```bash
curl -H "X-Api-Key: EBOOK_API_KEY" \
  "http://127.0.0.1:8787/api/v1/book/lookup?term=Foundation%20Isaac%20Asimov"

curl -H "X-Api-Key: AUDIOBOOK_API_KEY" \
  "http://127.0.0.1:8788/api/v1/book/lookup?term=Foundation%20Isaac%20Asimov"

curl -H "X-Api-Key: EBOOK_API_KEY" \
  "http://127.0.0.1:8787/api/v1/author/lookup?term=J.R.R.%20Tolkien"
```

With the stable `ghcr.io/snapetech/bookshelfng:softcover` image, lookup results
should include
nested `author` metadata and at least one `editions` entry. If you use upstream
Bookshelf and see `editions: []`, SeerrNG can still hydrate results that include
`foreignEditionId` and resolvable author metadata, but the Snapetech image is
the recommended fix.

## SeerrNG Diagnostic

The Bookshelf settings modal includes **Run Diagnostic**. It checks:

- backend unreachable,
- lookup returned no results,
- lookup returned incomplete/unusable results,
- backend rejected an add test,
- lookup is usable.

The API endpoint is:

```http
POST /api/v1/settings/readarr/diagnose
```

With a valid authenticated admin session, the body is the same Bookshelf settings
shape used by the service modal. Add `"testAdd": true` when you want SeerrNG to
attempt an add and immediately remove the test book without deleting files.

## Request Validation

After configuring both services:

1. Request an ebook for a known addable book.
2. Request an audiobook for a known addable book.
3. Request both formats for a known addable book.
4. Confirm the ebook request lands in `bookshelf-ebooks`.
5. Confirm the audiobook request lands in `bookshelf-audiobooks`.
6. Confirm each item uses the expected root folder and quality profile.
7. Confirm SeerrNG marks the request `COMPLETED`.

## Migration Lab

Use the lab runner to rehearse migration without writing to the source
Bookshelf/Readarr config. It copies source config directories into
`.bookshelf-migration-lab/source`, starts disposable Hardcover targets on
`18787` and `18788`, and writes migration reports under
`.bookshelf-migration-lab/backups`.

Discover visible local candidates:

```bash
deploy/bookshelf-migration-lab.sh discover
```

Report-only rehearsal:

```bash
SOURCE_EBOOK_CONFIG_DIR=/path/to/readarr-or-bookshelf-config \
HARDCOVER_MIGRATION_MAX_BOOKS=50 \
  deploy/bookshelf-migration-lab.sh report
```

Optional audiobook source:

```bash
SOURCE_EBOOK_CONFIG_DIR=/path/to/ebook-config \
SOURCE_AUDIOBOOK_CONFIG_DIR=/path/to/audiobook-config \
  deploy/bookshelf-migration-lab.sh report
```

Import strict matches into the disposable lab target only:

```bash
SOURCE_EBOOK_CONFIG_DIR=/path/to/ebook-config \
APPLY_IMPORT=true \
  deploy/bookshelf-migration-lab.sh apply
```

Print the latest lab report counts:

```bash
deploy/bookshelf-migration-lab.sh summary
```

Stop or remove the lab:

```bash
deploy/bookshelf-migration-lab.sh down
deploy/bookshelf-migration-lab.sh clean
```

If GHCR access is unavailable, the lab falls back to a local Bookshelf image
when one is present. It can also build a local Hardcover image from
`/home/keith/Documents/code/bookshelfng` when the base image is available.

## Rollback

If the migration fails:

1. Restore the generated backup:

   ```bash
   sudo BACKUP_DIR=/opt/bookshelf-backend/backups/20260518-145258 \
     deploy/install-bookshelf-backend.sh --legacy-bookshelf --restore-backup
   ```

   The restore command stops the rendered compose stack if
   `/opt/bookshelf-backend/compose.yml` exists, moves current config directories
   aside with a `.pre-restore-YYYYMMDD-HHMMSS` suffix, restores any backup
   tarballs present in `BACKUP_DIR`, and leaves Seerr settings unchanged. It can
   restore tarballs even when Docker is unavailable; in that case it skips
   compose shutdown and reports that explicitly.

2. Start the old Readarr container with the original mounts.
3. In SeerrNG, point the ebook service back to the old Readarr endpoint or
   disable book requests until Bookshelf is corrected.

Manual rollback is also possible:

1. Stop the Bookshelf stack:

   ```bash
   cd /opt/bookshelf-backend
   docker compose down
   ```

2. Restore the backed-up ebook config directory:

   ```bash
   rm -rf /mnt/datapool_lvm_media/readarr-config
   tar -C /mnt/datapool_lvm_media -xzf /path/to/readarr-config.tgz
   ```

3. Restore the audiobook config directory if it was changed:

   ```bash
   rm -rf /mnt/datapool_lvm_media/bookshelf-audiobooks-config
   tar -C /mnt/datapool_lvm_media -xzf /path/to/bookshelf-audiobooks-config.tgz
   ```

4. Restore rreading-glasses Postgres data if you need to preserve its cache:

   ```bash
   rm -rf /mnt/datapool_lvm_media/rreading-glasses-postgres/data
   tar -C /mnt/datapool_lvm_media/rreading-glasses-postgres \
     -xzf /path/to/rreading-glasses-postgres.tgz
   ```

Rollback does not require changing SeerrNG code. It only changes service
settings and backend containers.

## Troubleshooting

`backend_unreachable`:

- confirm the container is running,
- confirm SeerrNG can reach the host and port,
- confirm the API key is correct,
- confirm URL Base is empty unless Bookshelf is configured with one.
- For the supplied Compose files, SeerrNG and Bookshelf use host networking,
  so `127.0.0.1` reaches services on that host. If either container uses a
  bridge network instead, configure a host address and published port or a
  service name on a shared network; loopback inside one container cannot reach
  another container.
- From `/opt/bookshelf-backend`, inspect container health and logs:

  ```bash
  docker compose ps
  docker compose logs --tail=100 bookshelf-ebooks bookshelf-audiobooks
  ```

`lookup_empty`:

- check `BOOKSHELF_METADATA_MODE` in the generated `.env`;
- in native mode, confirm the Bookshelf image contains the native provider and
  `BOOKSHELF_HARDCOVER_AUTH` is present;
- in hosted mode, confirm `BOOKSHELF_METADATA_URL` is reachable;
- in compatibility mode, confirm rreading-glasses is running and Bookshelf
  `metadataSource` is `http://127.0.0.1:8790`;
- try an ISBN lookup such as `isbn:9780547928227`.

`lookup_incomplete`:

- confirm `/api/v1/author/lookup` works for the author,
- confirm the lookup result has `foreignEditionId`,
- update SeerrNG to a build that includes Bookshelf softcover hydration.

`backend_add_rejected`:

- check Bookshelf logs,
- confirm root folder and quality profile exist in that Bookshelf instance,
- confirm the selected root folder is writable inside the container,
- confirm download client paths match the container mounts.

Bulk request returns `serverId must be a positive integer`:

- update SeerrNG to a build that accepts zero-valued Servarr IDs in request
  overrides,
- confirm the service still exists in **Settings > Services**,
- retry the request after reloading the browser.

This can affect the first configured Bookshelf or Lidarr service because SeerrNG
stores service IDs starting at `0`. The backend must treat `0` as a valid
service/profile override value, not as a missing or invalid ID.

## Current Limitations

- Bulk book and music requests can still take a long time on large discographies
  or bibliographies. The modal shows submit progress and can retry failed items,
  but it does not yet offer a per-item backend preflight before submission.
- Music discography selection defaults to albums and can be filtered by release
  type. Review the selection before requesting singles, live albums,
  compilations, or other secondary release groups.
- Book requests rely on Bookshelf-compatible lookup metadata. The diagnostic
  can identify incomplete lookup results, but it does not yet run automatically
  before every request.
- Both-format book requests dispatch through two format-specific service
  entries. Check each entry when troubleshooting partial success; both can
  point to the same BookshelfNG instance.

## Optional chaptered M4B imports

BookshelfNG can merge an identified multi-file audiobook download into one
chaptered M4B. In the SeerrNG-managed deployment, set
`BOOKSHELF_M4B_MERGE=true` before running the installer. It stores that choice
in the generated `.env` and passes it to the combined process, or to both
processes when using the optional split layout. The default is `false`.

The standard BookshelfNG Docker image includes FFmpeg. The merge encodes AAC
at 128 kbps by default; set `BOOKSHELF_M4B_AAC_BITRATE_KBPS` to a value from
48 to 320 to change it. Original audio files are kept if conversion or M4B
import fails, and copy-only imports keep the source tracks. See the
[BookshelfNG merge guide](https://github.com/snapetech-org/bookshelfng/blob/main/docs/audiobook-m4b-merging.md)
for track ordering and failure behavior.

## Requesting a specific edition

The book request dialog lets you choose an ISBN edition. When you make an
explicit choice, SeerrNG keeps that ISBN and edition with the request and
passes it to BookshelfNG. The matching Bookshelf edition is selected for
acquisition; if that edition is absent from the configured metadata source,
the request reports the mismatch instead of silently switching editions.
Edition choices show their language when the catalog provides it. The
language filter selects the first matching ISBN candidate, and the edition
selector remains available for a manual override. The automatic edition
option keeps the existing best-match behavior.
