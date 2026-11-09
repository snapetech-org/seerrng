---
title: Moving between Seerr and SeerrNG
description: Preview and apply a two-way migration between Seerr and SeerrNG.
sidebar_position: 5
---

# Moving between Seerr and SeerrNG

`deploy/seerrng-migrate.mjs` moves settings and database records in either direction. Seerr to SeerrNG keeps all rows and settings that the destination schema accepts. SeerrNG to Seerr projects the settings and database onto what the destination Seerr installation supports, and reports the SeerrNG-only data it leaves behind.

The tool reads the source without writing to it. It writes only to a separate, newly initialized target. This lets you keep the source installation intact while you try the other application.

When returning to Seerr after a SeerrNG trial, migrate from the current SeerrNG installation into a newly initialized, empty Seerr target. This carries supported users, requests, and settings created during the trial; restoring the old Seerr snapshot would omit those changes. SeerrNG-only data remains in the untouched SeerrNG source and is listed in the report when it cannot be represented in Seerr.

## Before you start

1. Back up both config directories and any PostgreSQL databases.
2. Initialize the target application once at the version you intend to run, then stop it. This creates its database schema, `settings.json`, and Seerr's built-in discovery sliders.
3. Stop the source application. Keep both applications stopped until the migration finishes.
4. Use a target with no users, sessions, media, requests, or other application data. The tool permits only the target's database migration metadata and built-in discovery sliders; it replaces those sliders with the source's compatible entries.

The target must be separate from the source. The tool checks the target's product markers, requires the core Seerr tables, and refuses to import into a database that already contains user data. These checks prevent a reversed command from sending NG-only values into Seerr and prevent accidental merges or duplicate IDs.

## Preview a migration

For SQLite, the database is read from `<config-directory>/db/db.sqlite3`:

```bash
node deploy/seerrng-migrate.mjs \
  --direction seerrng-to-seerr \
  --source-dir /srv/seerrng/config \
  --target-dir /srv/seerr/config
```

Use `seerr-to-seerrng` for the opposite direction. The default mode is a read-only plan. Review its JSON report before applying. It includes row counts, source-only tables, omitted columns, unsupported media rows, permission reductions, unsupported settings paths, and target columns that cannot be filled. It never prints setting values or credentials.

## Apply the migration

Repeat the same command with `--apply`:

```bash
node deploy/seerrng-migrate.mjs \
  --direction seerrng-to-seerr \
  --source-dir /srv/seerrng/config \
  --target-dir /srv/seerr/config \
  --apply
```

The source remains unchanged. The target's database migration history and settings migration markers remain those created by the target application. The destination database import runs in one transaction; the target `settings.json` is replaced atomically after the rows pass integrity checks. If an ordinary database or file operation fails, the database transaction is rolled back and the previous target settings file is restored. PostgreSQL source reads use a repeatable, read-only transaction so every table comes from one database snapshot.

## PostgreSQL and mixed database types

SQLite is the default. For PostgreSQL, select the database type and provide connection URLs through environment variables so credentials are not placed in command-line arguments:

```bash
SEERR_MIGRATION_SOURCE_DATABASE_URL='postgresql://…' \
SEERR_MIGRATION_TARGET_DATABASE_URL='postgresql://…' \
node deploy/seerrng-migrate.mjs \
  --direction seerr-to-seerrng \
  --source-dir /srv/seerr/config \
  --target-dir /srv/seerrng/config \
  --source-db postgres \
  --target-db postgres
```

Set either side to `sqlite` to move between PostgreSQL and SQLite. The config directories are still required because `settings.json` is stored there.

## What moves back to Seerr

The reverse direction keeps the supported Seerr settings, including media server, Radarr/Sonarr, notification, network, and job settings. It imports compatible users, sessions, media, requests, seasons, watchlists, blocklists, and related rows based on the actual target Seerr database schema.

Seerr does not support SeerrNG's additional media categories and settings. The migration therefore:

- skips non-movie and non-TV media, requests, watchlists, blocklist entries, and discovery sliders;
- masks permission and notification bits that Seerr does not recognize;
- converts unknown user types to local accounts while retaining compatible account data;
- omits SeerrNG-only database tables and columns, such as extra media quotas and service routing fields;
- keeps only the Seerr settings namespaces and fields accepted by the initialized target.

The report lists these reductions by table, column, or settings path. Users whose account type was converted may need to sign in again or reset a local password.

## Scope

The migration covers `settings.json` and database rows. It does not copy logs, caches, or media files managed by Plex, Jellyfin, Radarr, Sonarr, or other services. Cache content can be rebuilt by the destination application.

The database transaction and settings file replacement are separate resources. If the host loses power or the process is forcibly killed during the final handoff, discard and reinitialize the target from the untouched source, then run the migration again. Do not point the destination app at a partially migrated target.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
