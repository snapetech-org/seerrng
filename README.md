<p align="center">
  <img src="./public/logo_full.svg" alt="SeerrNG" style="margin: 20px 0" />
</p>

<p align="center">
  <img src="https://github.com/snapetech-org/seerrng/actions/workflows/ci.yml/badge.svg" alt="SeerrNG CI" />
  <a href="https://github.com/snapetech-org/seerrng/blob/main/LICENSE"><img src="https://img.shields.io/github/license/snapetech-org/seerrng" alt="License" /></a>
  <a href="https://discord.gg/5PyXBfvS6T"><img src="https://img.shields.io/badge/support-Discord-5865F2?logo=discord&logoColor=white" alt="Support on Discord" /></a>
</p>

<p align="center">
  Support SeerrNG development on
  <a href="https://ko-fi.com/snapetech">Ko-fi</a>.
</p>

# SeerrNG

SeerrNG is a self-hosted request and discovery app for personal media libraries. It extends the Seerr/Jellyseerr/Overseerr lineage beyond movies and TV into music, books, comics, magazines, emulation ROMs, and PC games while keeping the familiar request approval workflow for Plex, Jellyfin, Emby, and automation-service users.

SeerrNG is maintained by snapetech as a separate fork so we can move quickly on cross-media workflows and test ambitious features while keeping Seerr as the base for inherited video, user, server, and deployment behavior. The fork gives us room to develop and validate ideas before proposing them upstream; it does not presume that upstream should adopt every feature or the entire product direction. See [why SeerrNG is a fork](./docs/fork-rationale.md) for the rationale, integration changes, and conditions that could let upstream equivalents replace the fork, and [NOTICE.md](./NOTICE.md) for attribution rules.

For local MCP access, see the [SnapeTech MCP integration guide](./docs/integrations/snapetech-mcp.md).

## Contents

- [What SeerrNG Does](#what-seerrng-does)
- [Project Status](#project-status)
- [Documentation and feature guides](#documentation)
  - [SeerrNG Android app](./docs/getting-started/android-app.md)
  - [Move between Seerr and SeerrNG](./docs/using-seerr/migrating-between-seerr-and-seerrng.md)
  - [Choose available media categories](./docs/using-seerr/settings/media-categories.md)
  - [Software requests: ROMs and PC games](./docs/using-seerr/software-acquisition.md)
  - [Request Status and Download copy](./docs/using-seerr/request-status.md)
  - [Books, authors, and series](./docs/using-seerr/books-and-series.md)
  - [ChaptarrNG Bookshelf integration](./docs/using-seerr/bookshelf-backend.md#chaptarrng)
  - [Read-only Audiobookshelf availability](./docs/using-seerr/bookshelf-backend.md#audiobookshelf-availability)
  - [Move Bookshelf media paths](./docs/using-seerr/bookshelf-media-path-migration.md)
  - [Configure comics](./docs/using-seerr/comics-backend.md)
  - [Configure magazines](./docs/using-seerr/magazines-backend.md)
  - [Movie and series Discover filters](./docs/using-seerr/movie-series-discovery-filters.md)
  - [Choose request destinations](./docs/using-seerr/settings/services.md#request-destination-label-optional)
  - [Require previous-season watch progress](./docs/using-seerr/settings/general.md#require-the-previous-season-to-be-watched)
  - [Hide subject tags](./docs/using-seerr/media-details-and-playback.md#hide-subject-tags)
  - [Filter and sort local watchlists](./docs/using-seerr/plex/watchlist-auto-request.md#find-items-in-your-watchlist)
  - [Follow another user's request](./docs/using-seerr/notifications/index.mdx#follow-a-movie-or-series-request)
  - [Companion services and SeerrNG NG forks](./docs/using-seerr/companion-services.md)
  - [Share to Request: links, ISBNs, lists, and photos](./docs/using-seerr/share-to-request.md)
  - [Continue, compare, and follow](./docs/using-seerr/cross-media-discovery.md)
  - [Cross-media feature requirements](./docs/using-seerr/cross-media-requirements.md)
  - [Following](./docs/using-seerr/following.md)
  - [SeerrNG Companion browser extension](./docs/using-seerr/browser-extension.md)
  - [Troubleshoot cross-media features](./docs/using-seerr/cross-media-troubleshooting.md)
  - [Add and import users](./docs/using-seerr/users/adding-users.mdx)
  - [Why SeerrNG is a fork and what could retire it](./docs/fork-rationale.md)
  - [Cross-platform setup assistant](./docs/using-seerr/setup-assistant.md)
  - [Indexer searches by media category](./docs/using-seerr/indexer-searches.md)
  - [Configure services](./docs/using-seerr/settings/services.md)
  - [Manage users and request preferences](./docs/using-seerr/users/editing-users.md)
  - [Slack notifications](./docs/using-seerr/notifications/slack.md)
  - [Telegram notifications](./docs/using-seerr/notifications/telegram.md)
  - [Configure notifications and follow request availability](./docs/using-seerr/notifications/index.mdx)
- [Screenshots](#screenshots)
- [Install](#install)
  - [Docker](#docker)
  - [Docker Compose](#docker-compose)
  - [Unraid](#unraid)
  - [Linux packages](#linux-packages)
- [Android APK](#android-apk)
- [Required Setup](#required-setup)
- [Bookshelf and Hardcover](#bookshelf-and-hardcover)
- [Environment Variables](#environment-variables)
- [Caching and Performance](#caching-and-performance)
- [Development](#development)
- [Testing Real Integrations](#testing-real-integrations)
- [Legal Use](#legal-use)
- [Support](#support)
- [Contributing](#contributing)
- [Attribution](#attribution)

## What SeerrNG Does

- Requests and approvals for movies, shows, music, ebooks, audiobooks, comics, magazines, emulation ROMs, and PC games.
- A companion Android APK client for connecting to one or more self-hosted SeerrNG servers.
- Movie and series Discover filters with 0.1-point TMDB rating thresholds and streaming-service availability filters by region.
- Media-server integration with Plex, Jellyfin, and Emby, including watch-state-aware My Library views scoped to each linked account.
- Optional Jellyfin and Emby profile sync during user imports, refreshing linked provider names and avatars while preserving SeerrNG email addresses, local passwords, and permissions.
- Labeled movie and TV request destinations across multiple Radarr and Sonarr instances, with per-user access and availability tracked for each destination.
- Managers can approve a one-time movie or TV request exception when a user's quota is full; optional Slack actions use a mapped account and the same request permissions as the web app.
- Automation service integration with Radarr, Sonarr, Lidarr, and Bookshelf/Readarr-compatible APIs.
- Sonarr v5 support alongside v3/v4, including metadata-language and season-order options with explicit season mapping for recovery.
- An optional TV request gate that checks whether the previous regular season was watched through a linked Plex, Jellyfin, or Emby account.
- Admin-configured Prowlarr connection, per-indexer diagnostics, category coverage, and format-aware manual search across movies, TV, music, books, comics, magazines, ROMs, and PC games, with title-prefilled search links from media details; approved requests still go through their configured acquisition providers.
- Music discovery and metadata through MusicBrainz, ListenBrainz, Cover Art Archive, TheAudioDB, and archive-backed artwork sources.
- Administrators can test MusicBrainz and Cover Art Archive connectivity and set bounded Cover Art Archive request limits.
- Book discovery and identity matching through Open Library, ISBN-10/ISBN-13 normalization, foreign book IDs, and edition IDs.
- Audiobook discovery from connected audiobook catalogs, with author and narrator filtering and no ebook-only search results.
- Comic discovery through ComicVine and magazine discovery through Google Books or LazyLibrarian. For new comic automation setups, SeerrNG recommends [Issuarr](https://github.com/issuarr/issuarr), the actively developed successor to [Mylar3](https://github.com/MylarComics/mylar3); existing Mylar3 connections remain supported through the same service type. Kapowarr and BackIssue are also supported comic backends, and LazyLibrarian handles magazines.
- Separate ebook and audiobook service routing so both formats can be requested, approved, scanned, retried, and removed independently.
- Existing BookshelfNG installations can manage both formats on the same book
  record. When both formats are enabled, their separate SeerrNG service
  entries can point to the same BookshelfNG URL and API key; new deployments
  should use the standard ChaptarrNG service.
- ChaptarrNG requests preserve the selected book format, show author-preparation
  progress and retry timing, and resume after imports complete. Pending imports
  are cancelled only when no other active request still needs them; ChaptarrNG
  `0.9.941+` also supports a restricted SeerrNG service key.
- The BookshelfNG-to-ChaptarrNG handoff is implemented in ChaptarrNG's one
  standard product, but BookshelfNG distribution retirement remains blocked.
  Public releases remain BookshelfNG `0.4.21.76` and ChaptarrNG `v0.9.977`;
  ChaptarrNG `main` is `fa55ffab` (full SHA
  `fa55ffabe632c7ee003791635ebe53fb1895d3df`), with latest application source
  snapshot `bd589312`. ChaptarrNG PR
  [#183](https://github.com/snapetech-org/chaptarrng/pull/183) merged at
  `96c953b2`, with follow-up main commits preserving legacy Docker handoff
  ports. The merged code does not add a compatibility image. Build run
  [41168525352](https://github.com/snapetech-org/chaptarrng/actions/runs/41168525352)
  is waiting on its merge-head validation at `96c953b2`; it does not validate
  the current application source. The main dispatch and platform/archive runs
  remain queued at older source; no exact-head pass for application source
  `bd589312` or current `main` `fa55ffab` is recorded here. No BookshelfNG
  package, image, installer, updater, or chart identity has been redirected.
  Keep BookshelfNG serving its existing data
  until feature parity, populated-data conversion, rollback, and each old
  installation channel are individually accepted. Each BookshelfNG
  capability, data/configuration path, and channel remains a blocker. The
  separate ChaptarrNG-to-upstream gate includes carried BookshelfNG behavior
  plus all ChaptarrNG features that are maintained, active, or unreleased.
  The current source-path audit compares BookshelfNG `1bd7f2dc` with ChaptarrNG
  `main` `fa55ffab` (application source `bd589312`), with 587 open
  dispositions; that is a path
  review count, not a missing-feature count. See
  the [BookshelfNG consolidation report](https://github.com/snapetech-org/bookshelfng/blob/main/docs/maintainers/chaptarr-consolidation.md)
  and [ChaptarrNG's itemized retirement matrix](https://github.com/snapetech-org/chaptarrng/blob/main/docs/FORK_FEATURES.md#itemized-active-and-unreleased-chaptarrng-blockers).
- Optional read-only Audiobookshelf library scanning marks ISBN-matched items
  as available audiobooks without sending acquisition requests or changing
  Audiobookshelf data.
- **Share to Request:** paste a link, ISBN, list of titles, or a photo (or use the Android Share menu) and request the matches you confirm, switching ebook and audiobook at the point of discovery. Photos are read by local OCR or an opt-in vision provider, including local Ollama-style servers.
- **Continue the story:** from an anime, find the manga or light novel that continues it, see where the finished season ends when documented, and request the right volume or follow future translated volumes. A franchise page groups sources, sequels, and side stories with confidence and evidence.
- **Editions and narrations:** compare narrators, full-cast and solo, abridged and unabridged, and keep a second performance alongside the first (ChaptarrNG); compare a series by narrator; request a specific standard, deluxe, or remastered album release.
- **Games and patches:** compare game editions and request only the expansions you choose (QuestarrNG), find games by theme, mode, perspective, and language with saved searches, and request exact translation or ROM-hack versions with the original kept alongside (ROMarrNG).
- **Discovery you steer:** Hardcover book recommendations with standalone, first-in-series, and less-popular filters; Collector Picks from slskdN with the reason each appeared.
- **Following:** follow narrators, authors, series, game content, artists, and patch projects and read personal news that says why each item appeared; optional auto-request is limited to books.
- A standalone [SeerrNG Companion browser extension](https://github.com/snapetech-org/seerrng-companion) for requesting from IMDb, Letterboxd, Steam, Goodreads, AniList, and more.
- Catalog browsing and requests for Retro and Modern emulation systems and PC games for Windows, Linux, and macOS, with QuestarrNG and ROMarrNG handling acquisition.
- Administrator-controlled availability switches for each supported category, including separate ebook, audiobook, Retro, Modern, and PC Games controls.
- Book backend diagnostics that classify Hardcover, softcover/Goodreads, and unknown metadata providers.
- ChaptarrNG is the recommended Hardcover-first book service for new deployments; BookshelfNG migration tooling remains available for existing Readarr or softcover libraries.
- A [preview-first BookshelfNG-to-ChaptarrNG database migration helper](./docs/using-seerr/bookshelf-backend.md#installer-script) for single-database installations. Migration apply remains frozen until feature, migration, rollback, and installation-channel acceptance is complete. BookshelfNG issue #144 is closed, but that did not close the remaining gates: do not run `--apply` or start ChaptarrNG against BookshelfNG appdata; keep BookshelfNG in service.
- Admin-only Bookshelf path moves with a conflict and disk-space preview, confirmation, API access, and a dry-run-first CLI. The mover works inside one BookshelfNG database; consolidate an old split deployment before using it.
- Resumable, layered Readarr/softcover-to-Hardcover migration with strict matching, softcover metadata recovery, validation, cutover checks, and an opt-in deterministic local-record fallback for books Hardcover cannot import.
- Per-user cross-media watchlists; local-only lists support title search, media-type filters, and stable sorting, while combined Plex lists preserve Plex ordering. The request workflow also includes blocklists, quotas, override rules, permissions, notifications, issue reporting, and request management.
- Users can choose whether movie and TV copies requested by someone else appear as shared or stay hidden; this changes the availability display, not media-server access.
- Discover shelves can be reordered and customized; movie and series filters include fractional ratings, streaming-service inclusion or exclusion, and category exclusions. Discover detail navigation keeps the selected result context, and rating details work on touch screens.
- Movie and Series Subject Tags can be hidden with a browser-saved preference shared across both detail pages.
- Authenticated **Download copy** links in Request Status for verified movie, TV, book, comic, magazine, ROM, and PC game files.
- Request lifecycle tracking and availability notifications link users back to the matching Request Status item, where available files can be selected and saved.
- Signed-in household members can follow another user's active movie or series request for a one-time availability notice through their own configured notification channels.
- Browser, service-worker, API, DNS, avatar, and image-proxy caching tuned for faster refreshes and tab restores.

## Project Status

SeerrNG is active fork work. Movie and TV behavior is inherited and generally stable. Music and book support is usable but should still be treated as evolving, especially around provider matching and real-world Bookshelf/Readarr edge cases.

Recent repository updates include:

- **Discover:** editable shared shelves; more precise rating and streaming
  filters; category exclusions; detail navigation through the current result
  list; and restored carousel position when returning from a title.
- **Requests:** per-user access to labeled Radarr/Sonarr destinations, quota
  exception approvals, optional Slack approval actions, an optional
  previous-season watch gate, and Sonarr monitoring for future seasons when
  the latest regular season was requested. Failed TV requests retain their
  context and support verified season mapping; missing movie or TV service
  destinations fail promptly with a retry path, and bounded failure
  explanations and request history are localized.
- **User workflows:** local watchlist filters, a browser-saved Subject Tags
  visibility preference, private one-time availability notices for followed
  requests, per-user shared-availability display choices, and opt-in
  Jellyfin/Emby profile refresh during imports.
- **Sonarr:** v5 API support alongside v3/v4, metadata-language and season-order
  choices, and request recovery scoped to the selected service, quality, and
  season order.
- **Integrations:** MusicBrainz and Cover Art Archive connectivity checks with
  bounded artwork traffic controls, plus a preview-first BookshelfNG to
  ChaptarrNG database migration helper for single-database setups.

These changes are in the repository; use the [release notes](./CHANGELOG.md)
to confirm which ones are included in a published build. SeerrNG continues to
adapt selected upstream work in attributed, reviewable changes. The
[fork-retirement matrix](./docs/fork-rationale.md) describes the behavior and
upgrade evidence a supported replacement would need before the core fork could
be retired.

Release notes are maintained in [`CHANGELOG.md`](./CHANGELOG.md). User-facing
pull requests add a concise release-note fragment under
[`release-notes/`](./release-notes/README.md); the release workflow publishes
those notes to GitHub Releases and the Discord release announcement.
Fragments capture the affected audience, product area, required action, and
breaking-change status, and CI shows the exact release-note preview during
review.
The historical tag coverage and audit method are documented in
[`docs/maintainers/release-history-audit.md`](./docs/maintainers/release-history-audit.md).
The in-app version check compares against published stable tags from the
SeerrNG fork, not the upstream Seerr repository.

## Documentation

SeerrNG documentation is maintained in the [docs folder](https://github.com/snapetech-org/seerrng/tree/main/docs). The links below open the corresponding guides directly:

- [Install SeerrNG](./docs/getting-started/index.mdx)
- [Install on Unraid](./docs/getting-started/third-parties/unraid.mdx)
- [Move between Seerr and SeerrNG](./docs/using-seerr/migrating-between-seerr-and-seerrng.md) — preview and carry compatible settings, users, and database records in either direction.
- [Find books, authors, and series](./docs/using-seerr/books-and-series.md)
- [Configure OIDC sign-in, account linking, and provider recovery](./docs/using-seerr/settings/users/oidc.md)
- [Cross-project OIDC implementation contract](./docs/maintainers/oidc-cross-project-template.md) · [provider catalog and official setup links](./docs/maintainers/oidc-provider-catalog.md)
- [Create custom Discover sliders](./docs/using-seerr/custom-discover-sliders.md)
- [Filter movie and series Discover results](./docs/using-seerr/movie-series-discovery-filters.md)
- [Configure Sonarr v5 and season orders](./docs/using-seerr/settings/services.md)
- [Require previous-season watch progress](./docs/using-seerr/settings/general.md#require-the-previous-season-to-be-watched)
- [Choose movie and TV request destinations](./docs/using-seerr/settings/services.md#request-destination-label-optional)
- [Filter and sort local watchlists](./docs/using-seerr/plex/watchlist-auto-request.md#find-items-in-your-watchlist)
- [Follow another user's request](./docs/using-seerr/notifications/index.mdx#follow-a-movie-or-series-request)
- [Hide Subject Tags](./docs/using-seerr/media-details-and-playback.md#hide-subject-tags)
- [Why SeerrNG maintains companion forks](./docs/using-seerr/dependency-forks.md)
- [Why SeerrNG is a fork and what could retire it](./docs/fork-rationale.md)
- [ChaptarrNG fork changes and capabilities](https://github.com/snapetech-org/chaptarrng/blob/main/docs/FORK_FEATURES.md)
- [Discover and request comics](./docs/using-seerr/comics-backend.md)
- [Discover and request magazines](./docs/using-seerr/magazines-backend.md)
- [Track requests and status history](./docs/using-seerr/request-status.md)
- [Browse and request emulation games and PC games](./docs/using-seerr/software-acquisition.md)
- [Share to Request](./docs/using-seerr/share-to-request.md)
- [Continue, compare, and follow](./docs/using-seerr/cross-media-discovery.md)
- [What each cross-media feature needs](./docs/using-seerr/cross-media-requirements.md)
- [Following](./docs/using-seerr/following.md)
- [Browser extension](./docs/using-seerr/browser-extension.md)
- [Troubleshoot cross-media features](./docs/using-seerr/cross-media-troubleshooting.md)
- [Download verified files from Request Status](./docs/using-seerr/request-status.md)
- [Use media detail and playback controls](./docs/using-seerr/media-details-and-playback.md)
- [Configure media-server libraries, including Plex Music and Audiobooks](./docs/using-seerr/settings/mediaserver.mdx)
- [Enable built-in HTTPS](./docs/using-seerr/advanced/built-in-tls.mdx)
- [Configure notifications](./docs/using-seerr/notifications/index.mdx)
- [Slack notification settings](./docs/using-seerr/notifications/slack.md)
- [Telegram notification settings](./docs/using-seerr/notifications/telegram.md)
- [Hide requested or available media](./docs/using-seerr/settings/general.md)
- [Choose which media categories are available](./docs/using-seerr/settings/media-categories.md)
- [Configure Bookshelf](./docs/using-seerr/bookshelf-backend.md)
- [Move ebook or audiobook files between Bookshelf root folders](./docs/using-seerr/bookshelf-media-path-migration.md)
- [Bookshelf metadata sources](./docs/using-seerr/bookshelf-metadata-sources.md)
- [Configure override rules](./docs/using-seerr/override-rules.md)
- [Manage users and request preferences](./docs/using-seerr/users/editing-users.md)
- [REST API reference](./seerr-api.yml)

## Screenshots

### Discover

<img src="./public/readme-discover-covers.jpg" alt="SeerrNG Discover page" width="100%" />

### Books

<img src="./public/readme-books-covers.jpg" alt="SeerrNG Books page" width="100%" />

### Music

<img src="./public/readme-music-covers.jpg" alt="SeerrNG Music page" width="100%" />

## Install

### Docker

The main container image is published from this repository:

```bash
docker run -d \
  --name seerrng \
  -e LOG_LEVEL=info \
  -e PORT=5055 \
  -p 5055:5055 \
  -v /path/to/seerrng/config:/app/config \
  --restart unless-stopped \
  ghcr.io/snapetech-org/seerrng:latest
```

Open `http://localhost:5055` and complete setup.

### Docker Compose

```yaml
services:
  seerrng:
    image: ghcr.io/snapetech-org/seerrng:latest
    container_name: seerrng
    environment:
      LOG_LEVEL: info
      PORT: 5055
      # Optional overrides; SeerrNG includes a default TMDB application key.
      TMDB_API_KEY: ${TMDB_API_KEY}
      TMDB_READ_ACCESS_TOKEN: ${TMDB_READ_ACCESS_TOKEN}
    ports:
      - 5055:5055
    volumes:
      - /path/to/seerrng/config:/app/config
    restart: unless-stopped
```

To create a guided starter stack for SeerrNG and common media apps on Windows,
macOS, or Linux, use the [cross-platform setup assistant](./docs/using-seerr/setup-assistant.md).

### Unraid

Install SeerrNG from Community Applications with the [Unraid template](https://raw.githubusercontent.com/snapetech-org/seerrng/main/packaging/unraid/seerrng.xml). It uses the stable `latest` image, maps HTTP port `5055` and optional HTTPS port `5056`, and persists `/app/config`. The image runs as UID/GID `1000:1000`, so make the selected appdata directory writable by that user before the first start. Optional BookshelfNG, ChaptarrNG, ROMarrNG, and QuestarrNG templates live in each fork's own repository; the [Unraid guide](docs/getting-started/third-parties/unraid.mdx) links to their templates and to the existing Community Apps listings for LazyLibrarian, Mylar3, and Kapowarr, plus Issuarr's own Unraid guide. BackIssue has its own Docker image and Unraid template; see its [getting-started guide](https://backissue.app/getting-started).

### Linux Packages

This repo includes release workflows and packaging metadata for tarball, Debian, RPM, AppImage, Flatpak, Snap, AUR, PPA, and COPR style distribution. These packages install SeerrNG as a standalone service; Lidarr, Bookshelf, and other automation/media servers are optional external services configured inside SeerrNG. Use the GitHub releases for generated artifacts when available.

### Android APK

The Android app is a client for servers you already run. Add one or more server
URLs in the app; see the [Android app guide](./docs/getting-started/android-app.md)
for setup and connection details. The Play build uses a 20-session free preview
and a one-time lifetime unlock at a recommended US price of $2.99. It contains
no advertising SDKs. See the [pricing and monetization decision](./android/MONETIZATION.md).

The current tested mobile packages are attached to the
[SeerrNG mobile prerelease](https://github.com/snapetech-org/seerrng/releases/tag/mobile-v3.63.0-ci.35):

| Package | Download | SHA-256 |
| --- | --- | --- |
| Android APK for direct install (stable project signing key) | [APK](https://github.com/snapetech-org/seerrng/releases/download/mobile-v3.63.0-ci.35/seerrng-v3.63.0-ci.35-android.apk) | [checksum](https://github.com/snapetech-org/seerrng/releases/download/mobile-v3.63.0-ci.35/seerrng-v3.63.0-ci.35-android.sha256) |
| Android App Bundle signed with the upload key | [AAB](https://github.com/snapetech-org/seerrng/releases/download/mobile-v3.63.0-ci.35/seerrng-v3.63.0-ci.35-android.aab) | [checksum](https://github.com/snapetech-org/seerrng/releases/download/mobile-v3.63.0-ci.35/seerrng-v3.63.0-ci.35-android-aab.sha256) |
| iOS Simulator build (not an iPhone/iPad installable IPA) | [Simulator ZIP](https://github.com/snapetech-org/seerrng/releases/download/mobile-v3.63.0-ci.35/seerrng-v3.63.0-ci.20-ios-simulator.zip) | [checksum](https://github.com/snapetech-org/seerrng/releases/download/mobile-v3.63.0-ci.35/seerrng-v3.63.0-ci.20-ios-simulator.sha256) |

The GitHub Android packages have Play Billing disabled, so they remain unlimited evaluation builds; the 20-session cap and lifetime purchase UI are only enabled in a configured Play build. These are prerelease test builds, not store-approved releases. See the
[mobile release readiness guide](./docs/mobile-release-readiness.md) for
signing details, test results, store status, and remaining release work.

## Required Setup

SeerrNG needs the same base setup as Seerr for video libraries, plus optional services for music and books.

Core:

- A Plex, Jellyfin, or Emby server.
- Radarr for movie automation.
- Sonarr for TV automation.
- SQLite or PostgreSQL for the application database.

Music:

- Lidarr server configured in **Settings > Services**.
- Root folder, quality profile, metadata profile, and tags configured from the Lidarr service settings.
- A default Lidarr server if users should be able to request music without choosing a service each time.
- Jellyfin and Plex music libraries can also be enabled in **Settings > Media
  Server**; albums need MusicBrainz metadata for SeerrNG to match existing
  media. Plex artist libraries can be reclassified as Audiobooks for audiobook
  availability. Lidarr remains the music automation and fallback source.

Books:

- ChaptarrNG is the recommended book service for new deployments; existing BookshelfNG and other Readarr-compatible services remain supported for current installations.
- One ChaptarrNG instance can manage both ebooks and audiobooks. Add two SeerrNG service entries with the same connection details and choose the matching format for each. Existing BookshelfNG installations can keep using one instance for both formats while the migration gates remain open.
- Audiobookshelf can be connected separately under **Settings > Services > Audiobookshelf Availability** to detect existing audiobooks. It is read-only and matches books by ISBN.
- Separate defaults for ebook and audiobook so **Both** format requests can route to each format.
- Existing Readarr or softcover/Goodreads libraries should be migrated before switching to Hardcover metadata. The service settings modal links directly to the Bookshelf Hardcover migration runbook.

Software requests:

- QuestarrNG provides the IGDB catalog and acquisition for PC game requests.
- ROMarrNG is also required for emulation requests. In **Settings > Services > Software Acquisition**, connect each provider and assign supported ROMarrNG systems to **Retro** or **Modern** before users can request them.
- Software requests support global and per-user quotas. Requesters can withdraw pending requests and cancel active QuestarrNG work that is linked to their request. ROMarrNG requests can be cancelled before download-client handoff; active transfers must be stopped in ROMarrNG or the download client.
- Provider hostnames and ports must be reachable from the SeerrNG server or container. Use each provider's SeerrNG integration API key; keys stay server-side.
- See the [software requests guide](./docs/using-seerr/software-acquisition.md) for provider setup, request targets, status, retries, notifications, and downloads. See [Request Status](./docs/using-seerr/request-status.md) for the shared Download copy workflow.

## Companion services

Media servers and acquisition tools run as separate optional services; they
are not bundled into the SeerrNG container. Use only the providers for the
categories you enable. For book and software workflows that depend on
SeerrNG-specific API behavior, the recommended Snapetech NG forks are
[BookshelfNG](https://github.com/snapetech-org/bookshelfng),
[ChaptarrNG](https://github.com/snapetech-org/chaptarrng),
[QuestarrNG](https://github.com/snapetech-org/QuestarrNG), and
[ROMarrNG](https://github.com/snapetech-org/ROMarrNG). ChaptarrNG is the
recommended book service for new installations; BookshelfNG remains available
for existing installations while migration acceptance is open. One ChaptarrNG
instance can serve both Book and Audiobook requests. ChaptarrNG also has an
optional BookLore BookDrop destination for imported files; BookLore is an
external app, not a SeerrNG or ChaptarrNG dependency. See the
[BookLore integration guide](https://github.com/snapetech-org/chaptarrng/blob/main/docs/BOOKLORE_INTEGRATION.md).
QuestarrNG handles PC game acquisition, while ROMarrNG handles emulation
systems and ROM acquisition.

As of 2026-10-31, BookshelfNG `0.4.21.76` and ChaptarrNG `v0.9.977` remain the
latest public releases. ChaptarrNG `v0.9.977` includes single-database SQLite
migration preview and conversion tooling, but apply remains frozen while
migration, rollback, feature-parity, and installation-channel acceptance are
open. ChaptarrNG PR #183 merged at `96c953b2`; its handoff uses the ordinary
ChaptarrNG product and does not add a compatibility image. Follow-up main
commits preserve the legacy Docker port contracts. The exact merge-head Build
[41168525352](https://github.com/snapetech-org/chaptarrng/actions/runs/41168525352)
is waiting and does not validate current application source `bd589312`; the
main and standalone platform/archive jobs remain queued at older source. No
exact-head pass for application source `bd589312` or current `main` `fa55ffab`
is recorded here. No legacy identity bridge has
been published or enabled, so existing BookshelfNG installations should keep
their current data and backup path. ChaptarrNG remains the maintained destination. Its later
retirement into upstream Chaptarr must preserve both ChaptarrNG's maintained
and actively added features, including unpublished work, and the BookshelfNG
features carried over. That complete union blocks ChaptarrNG retirement as a
whole. Each feature, sub-feature, data path, and distribution channel remains
an individual blocker; active ChaptarrNG branches and open feature PRs count
before release. See the [combined feature snapshot](https://github.com/snapetech-org/chaptarrng/blob/main/docs/FORK_FEATURES.md#chaptarrng-retirement-blockers)
and the [fork transition criteria](./docs/using-seerr/dependency-forks.md).

Radarr, Sonarr, Lidarr, LazyLibrarian, Mylar3, Issuarr, Kapowarr, and BackIssue are
separate upstream or third-party integrations. They are not NG forks. The
[companion services guide](./docs/using-seerr/companion-services.md) compares
providers, explains what each maintained NG fork provides, and links to the
[upstream transition criteria](./docs/using-seerr/dependency-forks.md).

## Bookshelf and Hardcover

SeerrNG recommends ChaptarrNG as the book backend for new deployments. Existing
BookshelfNG instances remain supported while migration acceptance is open.
Both services can manage ebooks and audiobooks from one instance; configure
separate SeerrNG service entries for the formats you enable.

```text
ghcr.io/snapetech/bookshelfng:hardcover
```

The stable `hardcover` and `softcover` tags are published only from
BookshelfNG's `main` release workflow, so SeerrNG follows the newest released
BookshelfNG build. Set `BOOKSHELF_IMAGE` to a digest-pinned reference when a
reproducible or rollbackable deployment is required.

### BookshelfNG and rreading-glasses

These components solve different problems. Fresh Hardcover installs use the
rreading-glasses compatibility boundary by default; native Hardcover remains an
explicit opt-in:

If Docker is not an option, see the [BookshelfNG source-build
guide](./docs/using-seerr/bookshelf-source-build.md) for a direct Linux build,
systemd service, metadata configuration, and SeerrNG connection.

- **BookshelfNG** is the maintained Readarr-style application. It manages the
  library, download clients, imports, file organization, and the
  Readarr-compatible API that SeerrNG uses.
- **rreading-glasses** is a compatibility/proxy layer. In compatibility mode,
  it exposes the metadata API BookshelfNG expects, translates requests to
  Hardcover or Goodreads, caches results in PostgreSQL, and coalesces or
  rate-limits upstream work.

Hardcover metadata modes are:

| Mode | Path | Local proxy | Best for |
| --- | --- | --- | --- |
| `compatibility` (default for fresh Hardcover installs) | BookshelfNG → rreading-glasses → upstream | On, with PostgreSQL | A durable shared cache, centralized throttling, or a compatibility boundary |
| `native` (explicit opt-in) | BookshelfNG → Hardcover GraphQL | Off | The simplest direct Hardcover deployment |
| `hosted` | BookshelfNG → `METADATA_URL` | Off | A hosted compatibility endpoint without local state |

Compatibility mode is the installer default because it keeps BookshelfNG
decoupled from Hardcover's GraphQL API and centralizes authentication, caching,
request coalescing, and upstream throttling. One proxy and PostgreSQL cache can
serve one or more BookshelfNG instances; one instance is enough for ebooks and
audiobooks. Existing installs that already use the local
proxy are preserved as compatibility mode on installer reruns.

Native mode remains useful when the shortest direct request path is more
valuable than the shared proxy boundary. Select it explicitly with
`BOOKSHELF_METADATA_MODE=native`.

There is no automatic runtime failover between modes. Compatibility mode is
not an unlimited offline mirror: cache misses, expired entries, searches, and
new metadata still need Hardcover. Its proxy and database are additional local
failure points, but the PostgreSQL cache survives proxy restarts.

For compatibility mode, provide `HARDCOVER_AUTH` with the `Bearer ` prefix; the
token is consumed by rreading-glasses rather than BookshelfNG. Native mode
passes the same token to BookshelfNG. Hosted mode does not require a local token for metadata,
although Bookshelf's own Hardcover list-import settings still need an API key
when that feature is used.

#### Hardcover API token requirement

Self-hosted `compatibility` and `native` modes require a Hardcover API token
from an account you control. Create one in [Hardcover account API
settings](https://hardcover.app/account/api). For compatibility mode, set
`HARDCOVER_AUTH`; for managed native mode, set `BOOKSHELF_HARDCOVER_AUTH` or
save the token in BookshelfNG **Settings > Metadata** when no environment
value overrides it. Hosted mode uses its configured metadata endpoint and does
not require a local Hardcover token for searches or lookups.

Any token configured on a self-hosted BookshelfNG or rreading-glasses service is
used server-side by all SeerrNG users connected to it. A shared hosted endpoint
such as `hardcover.bookinfo.pro` manages its own upstream access; changing the
local BookshelfNG token does not replace the hosted service's credential. To
use a personal token, configure a self-hosted native or compatibility service
with the token for that mode. The Hardcover list-import feature also requires
its configured API key.

### Compatibility-mode outage behavior

In compatibility mode, a metadata request follows this path:

1. BookshelfNG calls the local `rreading-glasses` endpoint; it does not call
   Hardcover directly.
2. rreading-glasses checks its in-memory cache and then its PostgreSQL-backed
   cache.
3. A cached, still-valid author, work, edition, or series response can be
   returned without contacting Hardcover.
4. A cache miss, expired entry, or free-text search needs an upstream request;
   successful responses are written back to the shared cache.

This gives connected Bookshelf instances a shared cache, coalesces concurrent
work, and centralizes rate limiting. A short Hardcover outage can therefore leave
already-cached direct lookups usable, and a proxy restart does not discard the
cache when the PostgreSQL volume is healthy. It does not make the system an
unlimited offline mirror: searches, recommendations, new metadata, and expired
entries still depend on Hardcover, and the current proxy does not promise
stale-if-error responses.

The proxy and PostgreSQL database are shared local dependencies. If either is
down, connected Bookshelf instances lose this metadata path. There is no
automatic runtime failover to Goodreads or OpenLibrary. Keep the proxy data volume while
troubleshooting; use `--validate-api`, an actual lookup, and proxy logs after
recovery. Native mode has a smaller local failure surface but only per-process
caching, so a fresh search or uncached refresh still needs Hardcover.

Legacy softcover/Goodreads deployments remain supported for existing users:

```text
ghcr.io/snapetech/bookshelfng:softcover
```

Do not convert an existing Readarr or softcover database to Hardcover by only
changing the image tag or `METADATA_URL`. Goodreads/softcover author, book, and
edition IDs are not portable to Hardcover. Use the migration flow below.

### Bookshelf Installer

Fresh deployments run one combined BookshelfNG process and one database for
ebooks and audiobooks. SeerrNG still needs two service entries because it
routes **Book** and **Audiobook** requests separately; point both entries to
the same BookshelfNG URL and API key. The installer remembers this choice.

Existing audiobook databases keep the split two-process layout on reruns. The
installer does not merge databases. Select `--single-instance` only after
migrating any separate audiobook database; the helper refuses to ignore one.
Use `--split-instances` when separate BookshelfNG settings or databases are
desired:

```bash
deploy/install-bookshelf-backend.sh
```

Useful modes:

```bash
deploy/install-bookshelf-backend.sh --dry-run
deploy/install-bookshelf-backend.sh --validate-only
deploy/install-bookshelf-backend.sh --validate-api
deploy/install-bookshelf-backend.sh --split-instances
deploy/install-bookshelf-backend.sh --migrate-to-hardcover
deploy/install-bookshelf-backend.sh --restore-backup
```

Use `--single-instance` to explicitly choose the combined deployment. Fresh
installs already choose it by default.

Set `BOOKSHELF_BACKEND=auto|hardcover|softcover` to choose the backend policy.
`auto` creates a Hardcover-backed BookshelfNG deployment for fresh installs
and invokes the migration flow when an existing Readarr/softcover config is
detected without a saved backend choice.

### Hardcover Migration

The migration toolchain is first-class for existing book libraries:

```bash
deploy/install-bookshelf-backend.sh --migrate-to-hardcover
node deploy/bookshelf-hardcover-migration.mjs --summary /path/to/hardcover-migration
node deploy/bookshelf-hardcover-migration.mjs --validate /path/to/hardcover-migration
node deploy/bookshelf-hardcover-migration.mjs --cutover-check /path/to/hardcover-migration
node deploy/bookshelf-hardcover-migration.mjs --reconcile-local /path/to/hardcover-migration
```

The migration is layered:

- inventory source Readarr/Bookshelf SQLite databases;
- strictly match native Hardcover records by ISBN/ASIN/title/author;
- preserve root folders, quality profiles, metadata profiles, tags, monitored state, and search policy;
- resume from checkpoints and skip previously applied records;
- retry transient target errors and de-duplicate bad target metadata cache rows;
- pre-create missing authors where Hardcover can resolve them;
- optionally query a softcover Bookshelf endpoint to recover title/author/edition metadata, then remap that profile back through Hardcover;
- query OpenLibrary for alternate title/author/ISBN profiles, then remap those candidates back through Hardcover;
- query Google Books and the Library of Congress for additional migration recovery profiles, then remap only strict matches through Hardcover;
- optionally call a configured Apify Actor to search Goodreads-compatible catalogs when the open APIs do not return useful metadata;
- optionally create deterministic local Bookshelf records for the books Hardcover still cannot import.

These catalogs support **normal BookshelfNG search and metadata lookups**, as
well as migration recovery. SeerrNG merges BookshelfNG results with its
Open Library results and carries each Bookshelf result's source identity
through details and book requests. The default deployment uses one BookshelfNG
instance and one catalog selection for both formats. The optional split
deployment can configure catalogs separately per process; it enables Library
of Congress on the audiobook process by default to coordinate request pacing.
Google Books and Europeana are added when their API keys are configured. Apify
remains operator-enabled. A provider result does not need a numeric Goodreads ID. See
the [metadata source support matrix](./docs/using-seerr/bookshelf-metadata-sources.md)
for setup, coverage, limits, and identity details.

Migration record states:

- `native`: Bookshelf rows backed by Hardcover book, author, and edition IDs.
- `shadow local`: Hardcover-shaped rows using stable `local:*` IDs when Hardcover has no acceptable entry yet.
- `reconciled`: former shadow rows promoted in place after Hardcover later resolves them.

The final fallback is explicit:

```bash
APPLY_HARDCOVER_REBUILD=true \
HARDCOVER_LOCAL_DB_IMPORT=true \
deploy/install-bookshelf-backend.sh --migrate-to-hardcover
```

or:

```bash
node deploy/bookshelf-hardcover-migration.mjs --apply --local-db-import \
  /path/to/hardcover-migration
```

Local fallback records use stable IDs such as `local:ebook:1076`. They are
visible through the Bookshelf API and count toward validation, but they are not
native Hardcover metadata records. Run `--reconcile-local` later to promote
shadow records in place when Hardcover can resolve them, without creating a
duplicate book.

Reconciliation writes `local-reconciliation-report.json` and updates
`applied-books.json` so promoted rows are marked `reconciledFromLocal: true`.

See:

- [Bookshelf backend guide](./docs/using-seerr/bookshelf-backend.md)
- [Bookshelf Hardcover migration runbook](./docs/using-seerr/bookshelf-hardcover-migration.md)

### Migration Lab

Use the lab runner to rehearse a migration without touching production config:

```bash
SOURCE_EBOOK_CONFIG_DIR=/path/to/source/ebook \
SOURCE_AUDIOBOOK_CONFIG_DIR=/path/to/source/audiobook \
deploy/bookshelf-migration-lab.sh apply
```

To rehearse the full 100% completion path:

```bash
HARDCOVER_LOCAL_DB_IMPORT=true \
SOURCE_EBOOK_CONFIG_DIR=/path/to/source/ebook \
SOURCE_AUDIOBOOK_CONFIG_DIR=/path/to/source/audiobook \
deploy/bookshelf-migration-lab.sh apply
```

The validated lab run imported `2115 / 2115` books with `0` failures using the
full layered chain.

## Environment Variables

Common runtime variables:

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port. Defaults to `5055`. |
| `LOG_LEVEL` | Server log level. |
| `NO_COLOR` | Set to a non-empty value to disable ANSI colors in console logs, unless `FORCE_COLOR` is non-empty. |
| `FORCE_COLOR` | A non-empty value overrides terminal detection and `NO_COLOR`; `0` or `false` disables console colors, and any other value enables them. |
| `TERM` | The terminal type; `dumb` disables console colors unless `FORCE_COLOR` is non-empty. |
| `CONFIG_DIRECTORY` | Alternate config directory for non-container installs. |
| `TMDB_API_KEY` | Optional TMDB v3 API key override. SeerrNG uses its bundled application key when this is unset. |
| `TMDB_READ_ACCESS_TOKEN` | Optional TMDB v4 bearer-token override. When set, it takes precedence over `TMDB_API_KEY`. |
| `SEARCH_CREDIT_CONCURRENCY` | Maximum concurrent TMDB credit lookups per server process during movie/TV searches; defaults to `10` and is capped at `40`. |
| `METRICS_ENABLED` | Enables the Prometheus `/metrics` endpoint when set to `true`. |
| `METRICS_AUTH_TOKEN` | Long random bearer token required by `/metrics` when metrics are enabled. |
| `OIDC_ALLOW_PRIVATE_ADDRESSES` | Allows server-side OIDC requests to private network addresses. Required only for an intentionally internal identity provider. |
| `OIDC_ALLOW_INSECURE` | Allows non-HTTPS OIDC provider requests. |
| `SEERR_EXTERNAL_READ_ONLY` | Blocks mutating requests to external automation APIs when enabled. Useful for test/lab environments. Production refuses to start with this enabled unless explicitly allowed. |
| `SEERR_ALLOW_PRODUCTION_EXTERNAL_READ_ONLY` | Allows `SEERR_EXTERNAL_READ_ONLY` in production for an intentional read-only clone. Do not set this on the writable request.snape.tech deployment. |
| `SEERR_REQUIRE_PUBLIC_SETUP_HOSTS` | Rejects private/LAN Jellyfin or Emby hostnames during the first-run setup wizard. Disabled by default because nearly all self-hosted media servers are on a LAN; see [Network settings](docs/using-seerr/settings/network.md). |
| `SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS` | Allows Discord/Slack/webhook/ntfy/Gotify notification URLs to target private/internal addresses. Needed only if your notification receiver also runs on your LAN. Disabled by default. |
| `SEERR_ALLOW_PRIVATE_PUSH_ENDPOINTS` | Allows web push subscription endpoints to target private/internal addresses. Disabled by default; the browser push service is normally public. |
| `SEERR_TLS_MODE` | Explicit environment override selecting `disabled` (default), `self-signed`, or `provided` for direct HTTPS. Self-signed/provided modes serve HTTPS on `SEERR_HTTPS_PORT`; HTTP redirects only when the redirect setting is enabled. See [Built-in HTTPS](docs/using-seerr/advanced/built-in-tls.mdx). |
| `SEERR_HTTPS_PORT` | HTTPS listener port when `SEERR_TLS_MODE` is `self-signed` or `provided`. Defaults to `5056` and must differ from `PORT`. |
| `SEERR_TLS_HOSTS` | Comma-separated DNS names/IP addresses included in generated self-signed certificates and accepted for HTTP-to-HTTPS redirects. Defaults to `localhost,127.0.0.1,::1`. |
| `SEERR_TLS_CERT_FILE` / `SEERR_TLS_KEY_FILE` | PEM certificate and matching private key used when `SEERR_TLS_MODE=provided`. The certificate must include DNS/IP subject alternative names. |
| `SEERR_TLS_CA_FILE` | Optional PEM CA bundle passed to the Node TLS context in `provided` mode; serve intermediates in the certificate file itself. |
| `SEERR_HTTP_REDIRECT_TO_HTTPS` | Environment override for the saved HTTP behavior when built-in TLS is enabled. Set `true` for 308 redirects; set `false` to keep an HTTP upgrade/recovery response while HTTPS is verified. |
| `SEERR_ALLOW_HTTP_AUTH` | Explicitly permits browser sessions over direct HTTP when `SEERR_TLS_MODE=disabled`. Disabled by default; mutually exclusive with TLS and warns about session-cookie interception. |
| `SEERR_SKIP_DB_MIGRATIONS` | Skips automatically running database migrations at startup in production. Only relevant when migrations are run out-of-band (e.g. `pnpm migration:run`, or a prepared Cypress test database). |
| `JELLYFIN_TYPE` | One-time settings-migration hint. Set to `emby` before the first start after upgrading if your existing configuration was saved as `Jellyfin` but the server is actually Emby; relabels the stored media server type and can be unset afterward. |

### First-run browser transport

The setup page will not allow a media-server login until the active browser
transport can persist a session. On a direct installation, choose built-in
self-signed HTTPS or a provided certificate, save the choice, restart SeerrNG,
and then open the HTTPS address. If HTTPS must remain disabled on a trusted
LAN, enable `SEERR_ALLOW_HTTP_AUTH=true` (or the matching **Allow authenticated
sessions over HTTP** option), acknowledge the warning, save, and restart.

If a previous attempt saved Jellyfin details but did not establish a session,
restart after correcting the transport and use `/login` to sign in again. Do
not submit the setup hostname a second time. See [Built-in HTTPS and HTTP
authentication modes](docs/using-seerr/advanced/built-in-tls.mdx) for the
status check and reverse-proxy requirements.

Use deployment secrets, `.env` files, or container environment variables. Do not commit private TMDB, Plex, Jellyfin, Emby, Radarr, Sonarr, Lidarr, Bookshelf, SMTP, or notification credentials.

Bookshelf deployment and migration variables live on the helper scripts rather
than the SeerrNG runtime container. Common ones include:

| Variable | Purpose |
| --- | --- |
| `BOOKSHELF_BACKEND` | `auto`, `hardcover`, or `softcover`. |
| `BOOKSHELF_IMAGE` | Override the Bookshelf image. Hardcover mode uses the stable Snapetech `main` release tag by default; use a digest to pin it. |
| `BOOKSHELF_METADATA_MODE` | `compatibility` (default for fresh Hardcover), `native`, or `hosted`. |
| `BOOKSHELF_METADATA_URL` | Compatibility or hosted metadata URL. Native Hardcover uses it only when native mode is disabled. |
| `BOOKSHELF_HARDCOVER_NATIVE` | Rendered Bookshelf flag; the installer sets it from `BOOKSHELF_METADATA_MODE`. |
| `BOOKSHELF_HARDCOVER_AUTH` | Native-mode token passed to BookshelfNG; compatibility mode passes `HARDCOVER_AUTH` to rreading-glasses instead. |
| `BOOKSHELF_HARDCOVER_API_URL` | Optional native Hardcover GraphQL base URL. Defaults to `https://api.hardcover.app`. |
| `BOOKSHELF_METADATA_SOURCES` | Legacy shared runtime override. When supplied to the installer it applies to both services; otherwise the per-service values take precedence. |
| `BOOKSHELF_EBOOKS_METADATA_SOURCES` | Ebook source list; defaults to `gutendex,googlebooks,europeana`. Google Books and Europeana run only when their keys are configured. |
| `BOOKSHELF_AUDIOBOOKS_METADATA_SOURCES` | Audiobook source list; defaults to `loc,gutendex,googlebooks,europeana`. Google Books and Europeana run only when their keys are configured. |
| `GOOGLE_BOOKS_API_KEY` | Optional Google Books runtime/migration key; Google Books is skipped without it. |
| `EUROPEANA_API_KEY` | Optional Europeana runtime key; a free registered key is required, and runtime search uses openly reusable text records. |
| `HARDCOVER_APIFY_GOODREADS_ACTOR` / `HARDCOVER_APIFY_TOKEN` | Optional runtime/migration Goodreads-compatible Actor; usage may be metered. |
| `HARDCOVER_APIFY_GOODREADS_INPUT_TEMPLATE` | Optional Apify Actor JSON input template containing `{{query}}`. |
| `HARDCOVER_AUTH` | Hardcover API token. The installer passes it to native BookshelfNG by default, or to rreading-glasses in compatibility mode; include the `Bearer ` prefix. |
| `COOKIE` | Optional Goodreads cookie for softcover mode. |
| `BOOKSHELF_EBOOKS_CONFIG_DIR` | Ebook Bookshelf/Readarr config directory. |
| `BOOKSHELF_AUDIOBOOKS_CONFIG_DIR` | Audiobook Bookshelf/Readarr config directory. |
| `HARDCOVER_EBOOK_API_KEY` / `HARDCOVER_AUDIOBOOK_API_KEY` | API keys for target Hardcover Bookshelf instances. |
| `HARDCOVER_SOFTCOVER_EBOOK_BASE_URL` / `HARDCOVER_SOFTCOVER_AUDIOBOOK_BASE_URL` | Optional softcover recovery endpoints. |
| `HARDCOVER_OPENLIBRARY_RECOVERY` | Enables OpenLibrary-assisted native Hardcover remapping. Defaults to `true`. |
| `HARDCOVER_GOOGLEBOOKS_RECOVERY` | Enables Google Books recovery for migration/reconciliation. Defaults to `true`; `GOOGLE_BOOKS_API_KEY` is required by Google's public API. |
| `HARDCOVER_LOC_RECOVERY` | Enables Library of Congress catalog recovery for migration/reconciliation. Defaults to `true`. |
| `HARDCOVER_APIFY_GOODREADS_ACTOR` / `HARDCOVER_APIFY_TOKEN` | Optional Apify Actor adapter for Goodreads-compatible recovery. Actor runs may be metered; set a JSON `HARDCOVER_APIFY_GOODREADS_INPUT_TEMPLATE` containing `{{query}}` when the Actor uses a different input schema. |
| `HARDCOVER_APIFY_API_BASE_URL` | Apify API base URL; defaults to `https://api.apify.com`. |
| `HARDCOVER_GOOGLEBOOKS_BASE_URL` / `HARDCOVER_LOC_BASE_URL` | Override provider API bases for controlled deployments and tests. |
| `HARDCOVER_LOCAL_DB_IMPORT` | Enables deterministic local DB fallback after API and softcover recovery fail. |
| `HARDCOVER_MATCH_CONCURRENCY` | Match report lookup concurrency. |
| `HARDCOVER_API_TIMEOUT_MS` | Target API timeout for migration requests. |

### Cypress Runtime Config

Cypress test seeding uses `cypress/config/settings.cypress.json`, which is intentionally a test-only configuration and does not include live Radarr, Sonarr, Lidarr, or Bookshelf settings.

By default, `pnpm cypress:prepare` and `pnpm cypress:start` use `CONFIG_DIRECTORY=cypress/runtime-config` so test seeding cannot overwrite the live `config/settings.json`. Do not point `CONFIG_DIRECTORY` at the live `config` directory for Cypress runs. If you intentionally need to reset live settings with Cypress data, set `SEERR_ALLOW_LIVE_CONFIG_OVERWRITE=true`; otherwise the prep script refuses to overwrite a live config that already has automation services configured.

## Caching and Performance

SeerrNG has several cache layers. They are designed to make repeat browsing, page refreshes, and tab restores fast while keeping media data reasonably fresh.

- **Service worker runtime cache** keeps cacheable API responses, static assets, avatars, and image proxy responses available to the browser.
- **Stale-while-revalidate API responses** let cacheable pages populate quickly while background requests refresh data.
- **Image proxy cache** stores supported external images under the config cache directory and returns browser validators for efficient `304 Not Modified` responses.
- **Visible-first warmup** warms images for visible titles before below-the-fold content.
- **Hidden-tab restraint** skips image warmup while the tab is hidden so returning to the tab does not flood the app with stale work.
- **Host caches** cover TMDB, MusicBrainz, ListenBrainz, Open Library, Cover Art Archive, TheAudioDB, Radarr, Sonarr, Lidarr, Readarr/Bookshelf, DNS, and image metadata where supported.
- **Jobs & Cache settings** expose cache stats and flush controls.

If SeerrNG runs behind a reverse proxy, do not blanket-strip cache headers or force `Cache-Control: no-store` on `/imageproxy/*`, `/avatarproxy/*`, `/sw.js`, static assets, or cacheable API responses. App pages and sensitive routes can remain non-cacheable.

## Development

Requirements:

- Node.js matching the repo/tooling version.
- `pnpm`.
- SQLite for local development, or PostgreSQL if testing that backend.

Install dependencies:

```bash
pnpm install
```

Run the development server:

```bash
pnpm dev
```

Useful commands:

```bash
pnpm typecheck
pnpm typecheck:client
pnpm typecheck:server
pnpm lint
pnpm test
pnpm test:node
pnpm test:tooling
pnpm test:playwright
pnpm build
pnpm --dir gen-docs build
```

The test scripts use the project’s native runners: `pnpm test` runs Vitest,
`pnpm test:node` runs the native TypeScript server tests, and
`pnpm test:tooling` runs the JavaScript tooling checks. CI also runs the browser,
documentation, plugin, chart, and security checks directly.

Migration-specific checks:

```bash
node --test deploy/bookshelf-hardcover-migration.test.mjs
bash -n deploy/bookshelf-migration-lab.sh deploy/install-bookshelf-backend.sh
deploy/bookshelf-migration-lab.sh discover
```

API docs are served by a running local install at:

```text
http://localhost:5055/api-docs
```

## Testing Real Integrations

For music and book changes, test against real services when possible:

- Add a Lidarr server, set it as default, request an album, approve it, scan it, retry failure cases, and remove it.
- Add a Bookshelf/Readarr-compatible ebook server, request a book by search result and specific edition/ISBN, approve it, scan it, retry it, and remove it.
- Add an audiobook Bookshelf service entry pointing to the same instance as the ebook entry, then test audiobook-only and both-format requests.
- Run `deploy/bookshelf-migration-lab.sh apply` against a copied source Bookshelf/Readarr config before changing migration code.
- Validate migration cutover with `node deploy/bookshelf-hardcover-migration.mjs --cutover-check <migration-dir>`.
- Confirm request cards, request detail pages, notifications, and backend links point to the correct SeerrNG and service pages.

See [docs/using-seerr/music-and-books-alpha.md](./docs/using-seerr/music-and-books-alpha.md) for the current hands-on test checklist.

See [docs/using-seerr/playlist-requests.md](./docs/using-seerr/playlist-requests.md) for playlist provider setup and the user import workflow.

## Legal Use

SeerrNG is intended for lawful personal media management. The project does not provide media, does not bypass DRM, and does not condone piracy or copyright infringement. Users are responsible for complying with the laws, licenses, and service terms that apply in their region.

## Support

- Discord: https://discord.gg/5PyXBfvS6T
- Issues: https://github.com/snapetech-org/seerrng/issues
- Discussions: https://github.com/snapetech-org/seerrng/discussions

Use upstream Seerr documentation when you need background on inherited deployment or video-library behavior, but report SeerrNG-specific music, book, cache, packaging, and branding issues in this repository.

## Contributing

Contributions should target SeerrNG behavior and this repository's current branch layout. Before opening a pull request:

- Keep fork attribution intact.
- Avoid reintroducing upstream-only branding.
- Add or update tests for request, validation, service-routing, cache, and scanner behavior.
- Run the relevant typecheck/test commands.
- Disclose AI assistance as required by [CONTRIBUTING.md](./CONTRIBUTING.md).

## Attribution

SeerrNG builds on Seerr, Jellyseerr, and Overseerr. Inherited code, documentation, and design remain credited to their original contributors. Fork-specific changes are credited to snapetech and SeerrNG contributors unless otherwise noted. See [NOTICE.md](./NOTICE.md) for the full attribution policy.

## Local security scanning

Run `./scripts/security-scan-local.sh` for local Semgrep CE and the Trivy scanners that fit this repository. The installed pre-commit hook scans the staged source/config snapshot after linting; Trivy runs on demand or in CI. This public repository also runs Semgrep CE and Trivy in GitHub Actions on main changes, pull requests, and weekly. Semgrep reports are retained as run artifacts for triage. See [security-scanning.md](docs/security-scanning.md). Use `./scripts/update-security-tools.sh` to refresh local scanner data and the Trivy database.
