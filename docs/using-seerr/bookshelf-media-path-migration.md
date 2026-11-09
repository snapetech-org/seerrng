---
title: Move Bookshelf media paths
description: Preview and move ebook or audiobook paths inside one BookshelfNG library from SeerrNG.
sidebar_position: 23
---

# Move Bookshelf media paths

Administrators can move ebook or audiobook files to another root folder managed
by a configured BookshelfNG service. SeerrNG asks BookshelfNG to inspect the
selected authors first, then requires confirmation before it queues the move.
BookshelfNG performs the file operation and updates its own library records.

This workflow runs inside **one BookshelfNG instance and database**. It does
not copy files or merge database rows between two BookshelfNG instances. If an
older deployment has separate ebook and audiobook instances, consolidate or
import the old library into the BookshelfNG instance you plan to keep first.
Follow the [Bookshelf migration runbook](./bookshelf-hardcover-migration.md) for
the database migration process. After the combined library is ready, use the
path mover to organize its files.

## Before you move files

- Update BookshelfNG to a build that provides the bulk media-move API.
- Back up the BookshelfNG database/configuration and the media files.
- Confirm that BookshelfNG can read and write both the current media folders
  and the destination root folder.
- Add a Bookshelf service in **Settings → Services** that points to the
  BookshelfNG instance containing the authors. Ebook and audiobook service
  entries may point to the same combined instance.
- Keep the SeerrNG API key private. The UI requires administrator permission;
  the CLI and API also require an authenticated administrator.

BookshelfNG versions without the move endpoints return an update message. The
path-move page does not fall back to direct file operations from SeerrNG.

## Use the web interface

1. Open **Settings → Library Migration** as an administrator.
2. Select the Bookshelf service that reaches the library to organize.
3. Choose **Ebooks** or **Audiobooks**. The selection controls which format path
   BookshelfNG updates for each author.
4. Optionally filter by current folder or author name. A library response is
   limited to the first 10,000 authors; SeerrNG displays a notice if that limit
   is reached.
5. Select up to 1,000 authors for a batch. Use smaller batches when you want
   to review or move the library in stages.
6. Choose an accessible destination root folder from that BookshelfNG
   instance, then select **Preview move**.
7. Review the file counts, source and destination paths, required copy space,
   warnings, and conflicts. Missing files are listed as skipped. A preview
   with conflicts or no movable files cannot be started.
8. Check the confirmation box and select **Start move**. SeerrNG queues the
   operation in BookshelfNG and shows the command status while it runs.

BookshelfNG revalidates its preview token when it accepts the move. If the
library or destination changes after preview, make a new preview before trying
again. SeerrNG does not modify provider files or database rows directly.

## Use the CLI

The CLI calls the same admin API as the web page. It needs the SeerrNG URL and
an administrator API key; do not use the BookshelfNG API key here.

```bash
export SEERRNG_URL="https://seerr.example.com"
export SEERRNG_API_KEY="your-seerrng-admin-api-key"
```

Create a preview and save its token in a private file. Repeat `--author-id` for
every selected author. Preview is the default and does not start a move:

```bash
pnpm bookshelf:move -- \
  --service-id 1 \
  --format audiobook \
  --source-root "/old/audiobooks" \
  --destination-root "/media/audiobooks" \
  --author-id 42 \
  --author-id 57 \
  --preview-file /tmp/bookshelf-audiobook-preview.json
```

Review the returned paths, counts, warnings, conflicts, and space estimate. The
preview file is created with mode `0600` and cannot overwrite an existing file.
It contains a provider preview token, so keep it private. Apply the saved
preview only after reviewing it:

```bash
pnpm bookshelf:move -- \
  --apply \
  --preview-file /tmp/bookshelf-audiobook-preview.json \
  --yes
```

The CLI requires `--yes` for apply, checks that the preview belongs to the
configured SeerrNG URL, and removes the file after BookshelfNG accepts the
command. If the preview has conflicts, create a new preview after resolving
them. Check progress using the command ID returned after apply:

Applying a saved CLI preview requires Linux or macOS so SeerrNG can open the
private preview without following a symbolic link. On Windows, use the web UI
or administrator API to apply a move.

```bash
pnpm bookshelf:move -- --service-id 1 --status 123
```

The saved preview token is single-batch authorization. BookshelfNG rejects it
if the move inputs have changed since the preview.

## Admin API

All routes are under `/api/v1/settings/readarr/{readarrId}/media-move` and
require administrator permission.

| Method and route | Purpose |
| --- | --- |
| `GET /configuration?format=ebook\|audiobook` | List authors, the selected format paths, and accessible Bookshelf root folders. |
| `POST /preview` | Preview between 1 and 1,000 unique author IDs and return a preview token. |
| `POST /start` | Queue the batch using the matching preview token; returns HTTP `202`. |
| `GET /commands/{commandId}` | Read the Bookshelf command status. |

Example preview request:

```json
{
  "authorIds": [42, 57],
  "format": "audiobook",
  "sourceRootPath": "/old/audiobooks",
  "destinationRootPath": "/media/audiobooks"
}
```

Pass the exact returned `previewToken`, author IDs, format, source (if used),
and destination to `/start`. A stale token returns HTTP `409`; call `/preview`
again and review its new result. The response schemas and status codes are in
the [REST API reference](../../seerr-api.yml).

## Old split Bookshelf deployments

The path mover does not move a library from an ebook Bookshelf database into a
separate audiobook Bookshelf database, nor does it merge both databases. First
choose the combined BookshelfNG database, import or merge the source library
into it using the [migration runbook](./bookshelf-hardcover-migration.md), and
verify the combined library in BookshelfNG. Then use the SeerrNG path mover to
move the selected ebook or audiobook files to the desired root folders inside
that combined instance.

You can keep two SeerrNG service entries for format-specific request routing;
they may share one BookshelfNG URL, port, and API key. The path-move service
selector chooses which configured connection to use, and the format selector
chooses the paths to update in that Bookshelf database.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
