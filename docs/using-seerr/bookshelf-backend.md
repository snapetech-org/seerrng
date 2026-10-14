---
title: Bookshelf Backend
description: Deploy Bookshelf for ebook and audiobook requests.
sidebar_position: 21
---

# Bookshelf Backend

SeerrNG sends book requests through the Readarr-compatible Bookshelf API and
preserves the metadata provider's native book, edition, and author IDs.
Hardcover remains the default for new deployments. Existing Goodreads/softcover
and other compatible metadata sources remain supported; moving
between providers is optional. Provider IDs are source-specific, so migrating a
library to another provider requires rebuilding its metadata records rather
than changing only the metadata URL or container image.

For the exact distinction between runtime metadata and migration-only
recovery, plus Google Books, Library of Congress, Apify, caching, IDs, and
future provider candidates, see [Bookshelf Metadata Sources and Migration
Recovery](./bookshelf-metadata-sources.md).

For how BookshelfNG differs from its Readarr-derived parent, which behavior is
specific to its SeerrNG API, and the upstream features needed to replace the
fork, see [Maintained dependency forks](./dependency-forks.md#bookshelfng).

BookshelfNG's planned retirement in favor of ChaptarrNG is not released yet.
No populated-library converter or old-channel bridge is available, so keep the
existing BookshelfNG database and installation until the
[feature, migration, and distribution gates](https://github.com/snapetech-org/bookshelfng/blob/main/docs/maintainers/chaptarr-consolidation.md)
pass. BookshelfNG's retirement gate is its capabilities validated in
ChaptarrNG. The later ChaptarrNG-to-Chaptarr gate is separate: all BookshelfNG
features carried over plus every ChaptarrNG maintained or actively added
feature, including unpublished work, block retirement as a whole. Each feature
remains an individual blocker until tested against the supported upstream
release; see the [combined ChaptarrNG retirement matrix](https://github.com/snapetech-org/chaptarrng/blob/main/docs/FORK_FEATURES.md#chaptarrng-retirement-blockers).

## One BookshelfNG instance for both formats

One BookshelfNG instance and database can manage ebooks and audiobooks on the
same book record. SeerrNG keeps format routing separate, so add two **Bookshelf**
service entries when you want both formats: set one to **Book** and the other
to **Audiobook**, and point both entries to the same BookshelfNG URL and API
key. The entries let SeerrNG route each format; they are not separate
BookshelfNG instances.

For a new deployment, run `deploy/install-bookshelf-backend.sh` without an
instance flag. It selects one combined BookshelfNG process by default. In
SeerrNG's first-run **Configure Services** step, add a **Book** connection,
then choose **Use this instance for Audiobooks** to create the second service
entry with the same connection details. Select its root folder and profiles
before saving. Use `--split-instances` only if you want isolated processes.

On upgrade, the installer keeps an existing split audiobook database and
SeerrNG keeps the configured service entries. To combine later, migrate the
separate audiobook library into the instance you will keep, verify its files
and requests, and back up the old database. After the separate database is no
longer at its configured path, run the installer with `--single-instance` and
point both SeerrNG entries to that instance. The installer refuses to ignore
an existing separate audiobook database; changing the two URLs alone does not
merge it.

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
tests in both repositories. The ChaptarrNG repository also includes a
cross-container Compose smoke test that runs SeerrNG's compiled API adapter
against a locally built ChaptarrNG image, checks the format-scoped paged
library, and verifies that administrative and unrelated command routes reject
the SeerrNG credential. Run it with the instructions in
[ChaptarrNG's SeerrNG integration guide](https://github.com/snapetech-org/chaptarrng/blob/main/docs/SEERRNG_INTEGRATION.md).
Pin the ChaptarrNG image version in reproducible deployments because its
Readarr-compatible surface can change between releases.

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

### Readarr to Softcover to Hardcover Migration

Make Hardcover the default Bookshelf backend for new installs while keeping
other compatible metadata sources first-class options. Migration to Hardcover
is optional; existing Goodreads/softcover users can keep their current backend
and SeerrNG service configuration.

Core policy:

- New install with no existing Readarr or Bookshelf config: one BookshelfNG
  instance can serve both formats. Add two SeerrNG service entries with the
  same endpoint when both request formats are enabled.
- Existing Readarr or softcover config: retain the configured backend unless
  the operator explicitly chooses to migrate.
- Matching: strict automatic migration only; fuzzy matches go to an optional
  admin review report, not automatic cutover.
- Softcover remains a supported Goodreads-compatible backend; Hardcover remains
  the default for new deployments.

### Installer and Compose

- Change the default image from the stable
  `ghcr.io/snapetech/bookshelfng:softcover` image to the stable
  `ghcr.io/snapetech/bookshelfng:hardcover` image.
- Add an installer backend mode:

  ```env
  BOOKSHELF_BACKEND=auto|hardcover|softcover
  ```

  The default mode should be `auto`.
- In `auto` mode:
  - if no existing config or database exists, create one combined Hardcover
    BookshelfNG instance for ebooks and audiobooks;
  - if an existing Readarr or softcover config/database exists, run the
    migration flow.
- For fresh Hardcover installs:
  - use the stable `ghcr.io/snapetech/bookshelfng:hardcover` image, which is
    updated only by a release from BookshelfNG's `main` branch;
  - use the local rreading-glasses compatibility boundary by default;
  - pass `HARDCOVER_AUTH` to rreading-glasses;
  - enable the rreading-glasses and PostgreSQL Compose profile;
  - keep native Hardcover available as an explicit opt-in.
- Installer reruns rewrite the generated `.env` to match the resolved backend
  mode. Existing `.env` files are kept as timestamped `.env.bak-*` files, and
  the existing `RREADING_GLASSES_POSTGRES_PASSWORD` is preserved when present.
- `BOOKSHELF_METADATA_MODE` controls the metadata path:
  - `compatibility` (default for fresh Hardcover): local rreading-glasses and
    its PostgreSQL cache;
  - `native`: direct GraphQL from BookshelfNG, with no local proxy;
  - `hosted`: disable native mode and use the hosted `METADATA_URL` without a
    local proxy;
  - compatibility mode activates the rreading-glasses and PostgreSQL Compose
    profile, and points BookshelfNG at the local proxy.
- Existing installs that have `BOOKSHELF_METADATA_URL` set to
  `http://127.0.0.1:*` or already use the `rreading-glasses` Compose profile
  are detected as `compatibility` on rerun. Set the mode explicitly to change
  that behavior.
- Use one BookshelfNG process and database for fresh ebook and audiobook
  deployments. SeerrNG still uses two format-specific service entries that
  point to that same instance. The optional `--split-instances` mode is for
  operators who need separate settings or databases; it is not required for
  either format.

### Migration Flow

Add a migration command to the installer:

```bash
deploy/install-bookshelf-backend.sh --migrate-to-hardcover
```

`BOOKSHELF_BACKEND=auto` should invoke this automatically when an existing
Readarr or softcover config is detected.

Preflight:

- verify Docker, compose, image pull, config paths, database readability, and
  free disk space;
- require `sqlite3` when an existing `nzbdrone.db` is present, so migration does
  not silently produce an empty inventory;
- require enough backup destination space for the existing ebook, audiobook, and
  rreading-glasses data paths with a default 2x margin. Override with
  `MIN_BACKUP_FREE_MULTIPLIER` when needed;
- detect existing `config.xml`, API key, port, `nzbdrone.db`, root folders,
  quality profiles, metadata profiles, monitored books, editions, tags, and
  service type;
- write a timestamped backup before stopping or changing containers.
- write `backup-manifest.json` with source paths, resolved backend mode, image,
  metadata URL, and backup archive names.

Inventory:

- export every monitored book with title, author, ISBN-13, ISBN-10, ASIN,
  foreign IDs, selected edition, root folder, quality profile, metadata profile,
  tags, monitor/search flags, and service type.

Matching:

- query a temporary Hardcover Bookshelf instance using ISBN/ASIN first;
- accept exact title plus exact author only when ISBN/ASIN is missing;
- reject ambiguous, missing, or fuzzy-only matches;
- write:
  - `migration-report.json`;
  - `matched-books.json`;
  - `unmatched-books.json`;
  - `ambiguous-books.json`;
  - `rebuild-payload.json`;
  - `rebuild-blocked.json`.

The installer writes inventory and report files by default. If a temporary
Hardcover target is already running, set `HARDCOVER_EBOOK_API_KEY` and
`HARDCOVER_AUDIOBOOK_API_KEY` before migration to let the helper populate strict
match reports. Override `HARDCOVER_EBOOK_BASE_URL` and
`HARDCOVER_AUDIOBOOK_BASE_URL` when the temporary target is not on
`127.0.0.1:8787` and `127.0.0.1:8788`. Hardcover API calls time out after
15 seconds by default; override with `HARDCOVER_API_TIMEOUT_MS`.
Validation lookup uses `Foundation Isaac Asimov` by default; override with
`HARDCOVER_VALIDATION_TERM` when a deployment has a better smoke-test title.
For rehearsals, limit matching volume with `HARDCOVER_MIGRATION_MAX_BOOKS`.
When API keys are missing or lookup cannot produce a strict match,
`unmatched-books.json` still includes the source title, author, root folder,
profile IDs/names, monitored state, tag labels, and identifiers for manual
review.

Applying the generated rebuild payload is opt-in. Set
`APPLY_HARDCOVER_REBUILD=true` only after reviewing `matched-books.json`,
`unmatched-books.json`, `ambiguous-books.json`, `rebuild-payload.json`, and
`rebuild-blocked.json`.

BookshelfNG also searches Library of Congress and Gutendex alongside Hardcover
by default. The standard deployment runs one BookshelfNG instance, which uses
the same catalog selection for ebooks and audiobooks. The optional split
deployment enables Library of Congress for the audiobook process by default to
coordinate outbound request pacing across processes, and enables Gutendex in
both processes. Google Books and Europeana are added when
`GOOGLE_BOOKS_API_KEY` and `EUROPEANA_API_KEY` are configured. Internet Archive
and NDL Search are opt-in. Europeana is limited to openly reusable text records
from its cultural heritage collection. These runtime catalogs return
source-qualified IDs that SeerrNG retains through search, details, and requests.
Set `BOOKSHELF_EBOOKS_METADATA_SOURCES` and
`BOOKSHELF_AUDIOBOOKS_METADATA_SOURCES` to override each service; the legacy
`BOOKSHELF_METADATA_SOURCES` value applies to both when supplied to the
installer. An empty per-service source list disables additional catalogs for
that service; set both per-service values empty to disable them in both
containers.
The installer preserves these settings and credentials when rewriting its
private `.env` file. A directly managed single BookshelfNG instance enables
LOC by default unless `BOOKSHELF_METADATA_SOURCES` overrides it.

Migration recovery separately queries Google Books and Library of Congress
before creating an optional local shadow record. These lookups are cached in
the migration directory and only promote a result into Hardcover when strict
identity matching succeeds. An optional Apify Actor adapter supports runtime
search and migration recovery for Goodreads-compatible scrapers. Configure
`HARDCOVER_APIFY_GOODREADS_ACTOR` and `HARDCOVER_APIFY_TOKEN`, and adjust
`HARDCOVER_APIFY_GOODREADS_INPUT_TEMPLATE` for the Actor's input schema. Actor
availability and pricing depend on the selected Actor. Runtime responses are
cached for one day; migration recovery makes at most two Actor runs per source
item.
Applied and failed adds are written to `applied-books.json` and
`apply-failures.json`. After apply, the helper writes `validation-report.json`
and marks `migration-report.json` as `validation_complete` or
`validation_failed` based on provider detection, lookup readiness, and whether
applied book IDs are visible in the target instance.

When applying matched books, source profile IDs are not treated as portable. The
helper carries source quality/metadata profile names into the rebuild payload,
remaps those names to target Hardcover profile IDs, and refuses an add when the
target profile or root folder is missing. Source tag IDs are also treated as
non-portable; the helper carries tag labels, resolves existing target tags by
label, and creates missing target tags before adding matched books.

Container cutover is gated by `cutover-decision.json`. Even when
`ALLOW_INCOMPLETE_HARDCOVER_CUTOVER=true` is set for development, the installer
refuses to continue unless validation completed successfully and no apply
failures or blocked rebuild items remain.

After report generation, the installer prints a concise migration summary with
match counts, apply counts, validation state, and cutover readiness. To reprint
that summary later:

```bash
node deploy/bookshelf-hardcover-migration.mjs --summary \
  /opt/bookshelf-backend/backups/20260518-145258/hardcover-migration
```

Rebuild:

- create a clean Hardcover config/database using the existing API key and port
  where possible;
- recreate root folders, profiles, metadata profiles, indexers, and download
  clients if they are exportable through the API or can be copied safely from
  database config tables;
- add matched books through the Hardcover Bookshelf API, preserving monitored
  state, root folder, quality profile, metadata profile, tags, and search
  policy.

Cutover:

- start Hardcover ebook and audiobook containers on the original ports;
- validate `/api/v1/config/development`, `/api/v1/book/lookup`, `/api/v1/book`,
  quality profiles, root folders, and request add/remove smoke tests;
- if validation passes, disable old softcover containers/configs but keep
  backups;
- if validation fails, restore the softcover backup and leave Seerr settings
  unchanged.

### SeerrNG Integration

- Extend Bookshelf diagnostics to classify backend provider:
  - `hardcover`;
  - `softcover`;
  - `unknown`.
- Surface the provider in **Settings > Services** diagnostics.
- Keep softcover hydration fallback for legacy users.
- Treat Hardcover as the recommended backend in docs and install paths.
- Keep Readarr-compatible API behavior in SeerrNG; do not require Seerr users
  to know provider internals.
- Add a warning when a Bookshelf service reports softcover/Goodreads metadata:
  `Legacy metadata backend. Hardcover is recommended for new installs.`

### Documentation Updates

- Replace the current Bookshelf backend guide with:
  - fresh Hardcover install path;
  - existing Readarr/softcover migration path;
  - softcover legacy fallback path;
  - rollback instructions;
  - matching policy and report interpretation.
- Document that direct ID reuse is unsafe:
  - `ForeignAuthorId`, `ForeignBookId`, and `ForeignEditionId` are
    provider-specific;
  - switching `METADATA_URL` alone is not migration.
- Document unsupported v1 migration items:
  - uncertain or fuzzy matches are not auto-applied;
  - historical activity/queue data may not be preserved unless verified safe;
  - Goodreads import lists are not guaranteed on Hardcover.

### Test Plan

Fresh install:

- no existing config path creates Hardcover instances by default;
- compatibility metadata is enabled by default and the rreading-glasses
  profile provides the shared PostgreSQL cache;
- explicit `BOOKSHELF_METADATA_MODE=native` disables the proxy and uses
  BookshelfNG's direct Hardcover provider;
- Seerr can add ebook, audiobook, and both-format requests.

Legacy softcover install:

- existing config triggers migration flow in `auto` mode;
- backup is created before mutation;
- matched books are recreated in Hardcover;
- unmatched/ambiguous books are reported and not auto-migrated;
- old softcover is disabled after successful validation.

Rollback:

- failed Hardcover validation restores original softcover config and ports;
- Seerr service settings remain usable.

Diagnostics:

- reports Hardcover vs Softcover;
- flags softcover as legacy;
- confirms lookup/add readiness for Hardcover.

Regression:

- existing softcover users can still opt into `BOOKSHELF_BACKEND=softcover`;
- existing Seerr book request tests continue passing;
- zero-valued service/profile IDs remain covered.
- migration helper pure logic is covered by
  `node --test deploy/bookshelf-hardcover-migration.test.mjs`.
- migration helper match, rebuild, apply, validation, and cutover readiness are
  covered against a mocked Bookshelf-compatible API in the same test file.
- live migration rehearsals can be run with
  `deploy/bookshelf-migration-lab.sh`, which copies source configs into an
  isolated lab, starts disposable Hardcover targets on ports `18787` and
  `18788`, and only imports books when run in `apply` mode.

### Assumptions

- Hardcover is the default for new users.
- Existing users get an automatic migration attempt, but only strict matches are
  applied.
- Fuzzy matches are report-only for v1 and can become an admin review UI later.
- After successful migration, softcover is disabled but backups are retained.
- The final user-facing service should continue to look like "Bookshelf" in
  SeerrNG, with provider details available only in diagnostics and docs.

## Why Bookshelf

The legacy `lscr.io/linuxserver/readarr` backend can be reachable and still
return unusable `/api/v1/book/lookup` records. A bad lookup usually has a title
and a foreign book ID, but no author object and no editions. SeerrNG refuses to
add those raw records because Bookshelf/Readarr can reject them or create broken
library entries.

Hardcover is the default path for new installs. Bookshelf with `softcover` and
`rreading-glasses` is also supported for Goodreads-compatible metadata, and
other Readarr-compatible provider endpoints can be configured through the same
service API. Goodreads no longer issues new public developer API keys, so
Goodreads support here is mediated by the configured Bookshelf-compatible
provider rather than a direct SeerrNG Goodreads client.
Goodreads' own developer notice says it no longer issues new public API keys;
the [Goodreads Developers notice](https://www.goodreads.com/group/show/8095-goodreads-developers)
therefore makes a Bookshelf-compatible provider the practical way to retain
Goodreads metadata support. SeerrNG uses provider-native author images returned
by Bookshelf when Open Library has no author photo.

## Architecture

BookshelfNG is the maintained Readarr-style application. One instance manages
both ebook and audiobook files, downloads, imports, file organization, and the
Readarr-compatible API that SeerrNG calls. When both request formats are
enabled, SeerrNG has two service entries pointing to that same instance.

The bundled installer defaults fresh deployments to one combined BookshelfNG
process, configuration, and database. SeerrNG still uses separate **Book** and
**Audiobook** service entries for request routing; both entries point to the
same BookshelfNG URL and API key. Existing audiobook databases retain the
split deployment on installer reruns, and the installer will not merge those
databases. Use `--split-instances` for an intentional two-process deployment
or `--single-instance` to request the combined layout explicitly.

A single instance uses one metadata catalog selection and one author-level
profile set. Each author uses one default path and can optionally set separate
ebook and audiobook folder overrides.

rreading-glasses is a metadata compatibility/proxy layer: it exposes the
metadata API BookshelfNG expects, translates requests to Hardcover, caches
results in PostgreSQL, and coalesces/rate-limits upstream work. Metadata has
three deliberate deployment modes:

| Mode | Bookshelf metadata path | rreading-glasses | Use it when |
| --- | --- | --- | --- |
| `compatibility` (default for fresh Hardcover) | BookshelfNG → local rreading-glasses → upstream | On, with PostgreSQL | A shared durable cache, centralized throttling, or a compatibility boundary |
| `native` (explicit opt-in) | BookshelfNG → Hardcover GraphQL | Off | The shortest direct Hardcover path |
| `hosted` | BookshelfNG → `METADATA_URL` such as `https://hardcover.bookinfo.pro` | Off | Native credentials are unavailable or a hosted compatibility endpoint is preferred |

Compatibility is the installer default because it keeps BookshelfNG decoupled
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

The repository includes an installer helper. A fresh deployment starts one
BookshelfNG process for both formats:

```bash
deploy/install-bookshelf-backend.sh
```

For existing Readarr or softcover deployments, use the full migration runbook:

```text
docs/using-seerr/bookshelf-hardcover-migration.md
```

It does the following:

- validates Docker, Docker Compose, the compose template, and the Bookshelf
  image,
- copies `deploy/compose.bookshelf.yml` into an install directory,
- writes an `.env` file with a generated Postgres password,
- backs up existing Bookshelf/Readarr config directories,
- creates the combined Bookshelf config on port `8787` by default; pass
  `--split-instances` to create separate ebook (`8787`) and audiobook (`8788`)
  configs,
- optionally stops an old Readarr container,
- starts the selected Bookshelf deployment with Docker Compose; starts
  rreading-glasses and Postgres only when
  `BOOKSHELF_METADATA_MODE=compatibility`,
- prints the Seerr settings and validation commands.

When an audiobook database is found, the helper preserves the split layout on
reruns. Use `--single-instance` only after separately migrating any data from
that database; the installer refuses to silently leave it behind. The
combined layout uses the same host, port, and API key in both SeerrNG format
entries.

Preview the install without changing files or containers:

```bash
sudo deploy/install-bookshelf-backend.sh --dry-run
```

Validate an already-rendered install directory without starting containers:

```bash
sudo deploy/install-bookshelf-backend.sh --validate-only
```

Validate the Bookshelf APIs after startup:

```bash
sudo EBOOK_API_KEY=replace-me \
  deploy/install-bookshelf-backend.sh --validate-api --skip-pull --no-stop-readarr
```

In split-instance mode, also set `AUDIOBOOK_API_KEY`; the helper validates
both processes separately.

Run it on the Docker host:

```bash
sudo INSTALL_DIR=/opt/bookshelf-backend \
  BOOKSHELF_EBOOKS_CONFIG_DIR=/mnt/datapool_lvm_media/readarr-config \
  BOOKSHELF_AUDIOBOOKS_CONFIG_DIR=/mnt/datapool_lvm_media/bookshelf-audiobooks-config \
  MEDIA_ROOT=/mnt/datapool_lvm_media \
  DOWNLOAD_ROOT=/mnt/datapool_lvm_media/download \
  PLEX_ROOT=/mnt/datapool_lvm_media/plex \
  deploy/install-bookshelf-backend.sh
```

To stop an existing Readarr container during migration:

```bash
sudo STOP_OLD_READARR_CONTAINER=readarr-host deploy/install-bookshelf-backend.sh
```

To keep an existing Readarr container running while preparing the new stack:

```bash
sudo STOP_OLD_READARR_CONTAINER=readarr-host \
  deploy/install-bookshelf-backend.sh --no-stop-readarr
```

To use the upstream image instead of the Snapetech fork:

```bash
sudo BOOKSHELF_IMAGE=ghcr.io/pennydreadful/bookshelf:softcover \
  deploy/install-bookshelf-backend.sh
```

If the image is already present locally or the registry requires authentication,
skip the pull step:

```bash
sudo deploy/install-bookshelf-backend.sh --skip-pull
```

## Manual Compose

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

For a fresh manual setup, make sure each Bookshelf config directory has a
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

In **Settings > Services**, add two Bookshelf service entries that point to
the same BookshelfNG host, port, and API key. This keeps SeerrNG's format
routing separate while BookshelfNG stores both formats in one library.
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
     deploy/install-bookshelf-backend.sh --restore-backup
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
