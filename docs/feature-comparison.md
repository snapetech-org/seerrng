---
title: Seerr and SeerrNG feature comparison
sidebar_position: 2
---

# Seerr and SeerrNG feature comparison

SeerrNG is a fork of Seerr, with inherited work from Jellyseerr and Overseerr.
This is SeerrNG-maintained documentation, not an upstream endorsement. Shared
features remain credited to their original projects. Every capability below
links to an in-repository guide; each guide ends with source attribution.

## Scope and how to read the table

Reviewed November 9, 2026 against these immutable source snapshots:

- **Seerr stable-line source:** [`main` at 564bfb08](https://github.com/seerr-team/seerr/tree/564bfb08b54caa374bddaf820abfd226e5e69151), package version 3.5.1.
- **Seerr development source:** [`develop` at 3f7d5c3b](https://github.com/seerr-team/seerr/tree/3f7d5c3bd2aff1af49f4a06e277f7dee0c2f2f14), the upstream default branch when checked.
- **SeerrNG source:** [`main` at d06af0e2](https://github.com/snapetech-org/seerrng/tree/d06af0e2589c3179bf3cee963160e50cc1387f07), including its maintained user guides, implementation and public attribution ledger.

This is a source capability inventory, **not a release announcement or end-to-end
certification**. Check the [changelog](https://github.com/snapetech-org/seerrng/blob/main/CHANGELOG.md)
and the assets of your installed release before relying on a new capability.
Music/books and companion integrations retain the limitations in their guides.
Native pages and Lumen can expose different controls; a backend API does not
imply a corresponding Lumen or native screen.

- **Shared** means the core capability exists in both projects; the SeerrNG
  column describes its fork-specific scope or extension.
- **Baseline …**, **Video only**, or another qualifier describes the narrower
  upstream capability. It does not mean upstream lacks the whole feature family.
- **Not found** means no equivalent built-in implementation was identified in
  either audited upstream snapshot. It is bounded to those sources, not a claim
  about every third-party extension or future upstream release.
- **Partial** and **Planned** in the SeerrNG column are deliberately unfinished
  work. In particular, Lumen's all-existing-user migration and companion import
  must not be advertised as complete.

## Browse the comparison

- [Core media and acquisition](#core-media-and-acquisition)
- [Discovery and metadata](#discovery-and-metadata)
- [Cross-media workflows](#cross-media-workflows)
- [Requests and availability](#requests-and-availability)
- [Notifications and playback](#notifications-and-playback)
- [Identity and security](#identity-and-security)
- [Interface and clients](#interface-and-clients)
- [Operations and compatibility](#operations-and-compatibility)

## Core media and acquisition

| Capability | Seerr | SeerrNG source behavior and requirements | In-repo guide |
| --- | --- | --- | --- |
| Movies and series | Shared | Movie/season requests, approvals and library status | [Guide](./using-seerr/request-status.md) |
| Plex, Jellyfin and Emby | Shared | Authentication, linked libraries and user imports | [Guide](./using-seerr/settings/mediaserver.mdx) |
| Radarr and Sonarr | Shared | Multiple service connections, HD/4K and anime defaults | [Guide](./using-seerr/settings/services.md) |
| Music and album requests | Not found | Lidarr acquisition; MusicBrainz, ListenBrainz and artwork providers | [Guide](./using-seerr/music-and-books-alpha.md) |
| Ebooks and audiobooks | Not found | Independent format requests, approvals and availability | [Guide](./using-seerr/bookshelf-backend.md) |
| ChaptarrNG and Bookshelf compatibility | Not found | Format-aware requests, import preparation, service key and migration boundaries | [Guide](./using-seerr/bookshelf-backend.md) |
| Bindery book acquisition | Not found | Dedicated ebook/audiobook backend configuration | [Guide](./using-seerr/bindery-backend.md) |
| Read-only Audiobookshelf availability | Not found | ISBN-matched audiobook library scan; no acquisition writes | [Guide](./using-seerr/bookshelf-backend.md) |
| Comic requests | Not found | Issuarr/Mylar-compatible, Kapowarr and BackIssue destinations; manga through BackIssue with AniList search and edition choice | [Guide](./using-seerr/comics-backend.md) |
| Magazine requests | Not found | Google Books/LazyLibrarian discovery and magazine acquisition | [Guide](./using-seerr/magazines-backend.md) |
| Retro and Modern ROM requests | Not found | Platform browsing and ROMarrNG acquisition | [Guide](./using-seerr/software-acquisition.md) |
| PC game requests | Not found | Windows/Linux/macOS catalogue and QuestarrNG acquisition | [Guide](./using-seerr/software-acquisition.md) |
| Adult scenes | Not found | Optional age-gated Whisparr category | [Guide](./using-seerr/adult-media.md) |
| Sports leagues and events | Not found | Sportarr browsing, requests, monitoring and status | [Guide](./using-seerr/sportarr.md) |
| Per-category availability controls | Video only | Separate ebook, audiobook, comic, magazine, game and adult switches | [Guide](./using-seerr/settings/media-categories.md) |
| Reader apps and verified delivery | Not found | Reader links, verified downloads and live reader shelves; separate from acquisition | [Guide](./using-seerr/reader-delivery.md) |
| Download Inbox | Not found | Permission-controlled warning review, manual-import preview and rejection | [Guide](./using-seerr/download-inbox.md) |
| ReadMeABook audiobooks | Not found | Search, approval, request status and acquisition dashboard; no verified-language requests | [Guide](./using-seerr/readmeabook.md) |

## Discovery and metadata

| Capability | Seerr | SeerrNG source behavior and requirements | In-repo guide |
| --- | --- | --- | --- |
| Discover shelves and catalogue filters | Shared | Movie/TV browsing plus cross-media shelves | [Guide](./using-seerr/discover.md) |
| Custom Discover sliders | Shared baseline | TMDB lists and expanded cross-media/custom slider sources | [Guide](./using-seerr/custom-discover-sliders.md) |
| Fine-grained TMDB rating filters | Baseline range | 0.1-point thresholds, vote counts and explicit filter behavior | [Guide](./using-seerr/movie-series-discovery-filters.md) |
| Streaming-service filters | Baseline selection | Region-aware include/exclude and bulk selection | [Guide](./using-seerr/movie-series-discovery-filters.md) |
| Genre and series-status exclusions | Baseline filters | Include/exclude conditions and validated movie/TV sorts | [Guide](./using-seerr/movie-series-discovery-filters.md) |
| Per-account local-library discovery | Baseline availability | Verify linked account access before showing local results | [Guide](./using-seerr/media-server-access.md) |
| Global search and collections | Baseline search | Cross-media search, collection results and normalized fallback queries | [Guide](./using-seerr/search.md) |
| People and credits | Baseline filmography | Sorted person credits and matching through people | [Guide](./using-seerr/people-and-credits.md) |
| Book authors, series and narrators | Not found | Book/series discovery with format and identity matching | [Guide](./using-seerr/books-and-series.md) |
| Metadata providers and music limits | Video metadata | MusicBrainz/CAA diagnostics, bounded artwork and music request limits | [Guide](./using-seerr/settings/metadata.md) |
| Administrator book language policy | Not found | Language admission and edition evidence; existing files are preserved | [Guide](./using-seerr/book-language-policy.md) |
| Book metadata-source diagnostics | Not found | Hardcover, softcover/Goodreads and unknown-provider diagnostics | [Guide](./using-seerr/bookshelf-metadata-sources.md) |
| Trakt, AniList, Simkl and MDBList | Not found | Separate application credentials, personal links, lists, ratings and explicit writeback | [Guide](./using-seerr/discovery-integrations.md) |
| Prowlarr diagnostics and manual search | Not found | Category-aware, title-prefilled indexer search; configured backends still acquire | [Guide](./using-seerr/indexer-searches.md) |
| Swipe discovery | Not found | Cross-media swipe browsing, preferences and request history | [Guide](./using-seerr/swipe.md) |
| Ratings and poster summaries | Baseline TMDB/detail scores | Combined provider ratings and poster popovers with partial-provider fallback | [Guide](./using-seerr/discovery-integrations.md) |
| External request lists | Plex watchlist baseline | IMDb/CSV, Goodreads and Hardcover inputs with normal request admission | [Guide](./using-seerr/external-request-lists.md) |
| Release Calendar | Not found | Permission-aware cross-media date views with partial-source reporting | [Guide](./using-seerr/release-calendar.md) |

## Cross-media workflows

| Capability | Seerr | SeerrNG source behavior and requirements | In-repo guide |
| --- | --- | --- | --- |
| Share to Request | Not found | Links, ISBNs, title lists and photos with explicit match confirmation | [Guide](./using-seerr/share-to-request.md) |
| Local OCR and optional vision | Not found | Photo recognition with local OCR or opt-in vision provider | [Guide](./using-seerr/share-to-request.md) |
| Anime continuation and franchise map | Not found | Evidence-backed manga/light-novel continuation, volumes and relationships | [Guide](./using-seerr/cross-media-discovery.md) |
| Book editions and narration comparison | Not found | Narrator/cast/language comparison and specific-edition requests | [Guide](./using-seerr/cross-media-discovery.md) |
| Keep an additional book performance | Not found | Alongside/either-version selection; requires supporting ChaptarrNG capability | [Guide](./using-seerr/cross-media-discovery.md) |
| Collect a series with a narrator | Not found | Series coverage comparison and permission-controlled collection preference | [Guide](./using-seerr/cross-media-discovery.md) |
| Specific album releases | Not found | Compare MusicBrainz editions and request a specific Lidarr release | [Guide](./using-seerr/cross-media-discovery.md) |
| Game editions and expansions | Not found | Select base game, expansions or complete editions through QuestarrNG | [Guide](./using-seerr/cross-media-discovery.md) |
| Translations and ROM hacks | Not found | Exact ROMarrNG patch versions, original kept alongside and project follows | [Guide](./using-seerr/cross-media-discovery.md) |
| Saved Game Finder searches | Not found | Themes, modes, perspectives, language and length with matching reasons | [Guide](./using-seerr/cross-media-discovery.md) |
| Hardcover recommendations | Not found | Personal/featured/popular feeds and standalone/series/popularity filters | [Guide](./using-seerr/cross-media-discovery.md) |
| Collector Picks | Not found | Followed slskdN collector releases with explanation | [Guide](./using-seerr/cross-media-discovery.md) |
| Following and personal news | Not found | People, companies, networks, genres, authors, narrators, artists and projects | [Guide](./using-seerr/following.md) |
| Book-follow automatic requests | Not found | Optional supported book automation; other follows remain informational | [Guide](./using-seerr/following.md) |
| Playlist requests | Not found | Preview and import playlists as music requests | [Guide](./using-seerr/playlist-requests.md) |
| Household game library | Not found | Game ownership tracking and household overlap views | [Guide](./using-seerr/game-library.md) |
| Private movie watch sessions | Not found | Private ballots, maturity intersection and unanimous matches; no automatic requests | [Guide](./using-seerr/watch-sessions.md) |

## Requests and availability

| Capability | Seerr | SeerrNG source behavior and requirements | In-repo guide |
| --- | --- | --- | --- |
| Granular permissions, quotas and approvals | Shared | Cross-media permission and request lifecycle extensions | [Guide](./using-seerr/users/editing-users.md) |
| Local and Plex watchlists | Shared video baseline | Cross-media local lists, filters and stable sorting; preserve combined Plex order | [Guide](./using-seerr/plex/watchlist-auto-request.md) |
| Requester identity and request-on-behalf | Baseline administration | Resolve preferences and authorization for the actual request owner | [Guide](./using-seerr/request-defaults.md) |
| Per-user request destinations | Baseline multiple services | Labeled Radarr/Sonarr destinations with per-user access and availability | [Guide](./using-seerr/settings/services.md) |
| Saved folder, language and quality defaults | Baseline advanced options | Per-user defaults; distinguish displayed defaults from deliberate overrides | [Guide](./using-seerr/request-defaults.md) |
| Override rules | Shared baseline | Production-country conditions, service-ID matching and explicit-choice preservation | [Guide](./using-seerr/override-rules.md) |
| Quota-exception approvals | Not found | Request a one-time movie/TV exception when quota is full | [Guide](./using-seerr/settings/users/index.md) |
| Previous-season watched gate | Not found | Optional account-linked Plex/Jellyfin/Emby progress gate | [Guide](./using-seerr/settings/general.md) |
| Episode Queue | Not found | Per-user defaults, one starting episode before queue approval and playback-aware progression | [Guide](./using-seerr/jellyfin-watch-ahead.md) |
| Movie collection queue | Not found | Progressively request collection movies as prior entries are watched | [Guide](./using-seerr/movie-collection-queue.md) |
| Per-episode file availability | Not found | Optional Sonarr and media-server source reconciliation; separate HD/4K and order choices | [Guide](./using-seerr/individual-episode-availability.md) |
| Per-user movie/TV availability | Baseline shared status | Verify private library access; configure other-user availability presentation | [Guide](./using-seerr/media-server-access.md) |
| Multiple destination availability | Baseline quality status | Track request/availability per acquisition destination | [Guide](./using-seerr/settings/services.md) |
| Standard and 4K controls | Shared tiers | Global/category switches and independent availability/request targets | [Guide](./using-seerr/settings/media-categories.md) |
| Per-user maturity ratings | Not found | Administrator-enforced movie/TV rating caps | [Guide](./using-seerr/age-gate.md) |
| Streaming-subscription request policy | Not found | Reject, pending, auto-approve and explicit override policies | [Guide](./using-seerr/settings/general.md) |
| Automatic genre blocklisting | Baseline manual blocklist | Administrator region/language/genre rules | [Guide](./using-seerr/settings/general.md) |
| Hide available, requested or blocklisted titles | Baseline hide controls | User/category-aware presentation and local filters | [Guide](./using-seerr/settings/general.md) |
| Request status sorting and history | Baseline request list | Cross-media status, failure explanation and recovery; settle owned selected TV seasons | [Guide](./using-seerr/request-status.md) |
| Automatic transient-failure retry | Not found | Bounded retry classification and visible retry state | [Guide](./using-seerr/request-status.md) |
| Missing/deleted service recovery | Baseline failure handling | Prompt failure and manager recovery with retained request context | [Guide](./using-seerr/request-status.md) |
| TV identity and season mapping recovery | Baseline TVDB identity | Resolve missing IDs and explicitly map requested seasons | [Guide](./using-seerr/request-status.md) |
| Requester tags on existing media | Not found | Authorized requester tags without unnecessary new acquisition | [Guide](./using-seerr/requester-tags.md) |
| Sonarr v5 and numbering order | Baseline Sonarr integration | v3/v4/v5 settings, language and alternate season mapping | [Guide](./using-seerr/settings/services.md) |
| Bounded live download progress | Baseline queue status | Complete bounded snapshots; preserve last verified state on partial failure | [Guide](./using-seerr/live-download-progress.md) |
| Verified file downloads | Not found | Permission-controlled request downloads with file identity revalidation | [Guide](./using-seerr/request-status.md) |
| Live TV recordings | Not found | Authorized Plex/Jellyfin recording workflows | [Guide](./using-seerr/live-tv-recordings.md) |
| Issue reporting and comments | Shared baseline | Report processing movie/TV requests before availability; permission-aware comments | [Guide](./using-seerr/request-status.md) |
| Scoped request-intent API | Not found | Viewer-safe state, hashed idempotency keys and scoped availability follows | [Guide](./integrations/pleazyng-quiet-requests.md) |

## Notifications and playback

| Capability | Seerr | SeerrNG source behavior and requirements | In-repo guide |
| --- | --- | --- | --- |
| Notification agents | Shared baseline | Email, Discord, Telegram, Slack, webhooks, push and cross-media messages | [Guide](./using-seerr/notifications/index.mdx) |
| Follow another user's request | Not found | Private one-time availability notices with user-configured channels | [Guide](./using-seerr/notifications/index.mdx) |
| Slack approval actions | Notifications only | Mapped-account approve/decline actions with normal permissions | [Guide](./using-seerr/notifications/slack.md) |
| Webhook string filters | Baseline webhooks | Bounded template formatting and pending-update messages | [Guide](./using-seerr/notifications/webhook.md) |
| Multiple push devices | Baseline Web Push | Device/account-safe subscription handling | [Guide](./using-seerr/notifications/webpush.md) |
| Gotify poster embedding | Baseline agent | Configurable poster embedding | [Guide](./using-seerr/notifications/gotify.md) |
| ntfy notification tags | Baseline ntfy | Configurable tags | [Guide](./using-seerr/notifications/ntfy.md) |
| Media-server playback links | Baseline detail links | Destination-aware playback controls on media pages/cards | [Guide](./using-seerr/media-details-and-playback.md) |
| Plex active-playback analysis | Not found | Analyze seasons during active Plex playback | [Guide](./using-seerr/plex-playback-analysis.md) |
| Native desktop playback | Not found | Optional local-player integration with documented prerequisites | [Guide](./using-seerr/native-desktop-playback.md) |
| Navidrome | Not found | Music-library and playback integration | [Guide](./using-seerr/navidrome.md) |
| Soulseek and slskdN | Not found | Configured music integration and collection discovery | [Guide](./using-seerr/soulseek-slskdn.md) |
| Jellystat | Not found | Optional Jellyfin statistics integration | [Guide](./using-seerr/jellystat.md) |

## Identity and security

| Capability | Seerr | SeerrNG source behavior and requirements | In-repo guide |
| --- | --- | --- | --- |
| User administration | Shared | Account creation/import, search, per-user preferences and permissions | [Guide](./using-seerr/users/editing-users.md) |
| Local and media-server sign-in | Shared | Local/Plex/Jellyfin/Emby accounts and safe post-login return | [Guide](./using-seerr/settings/users/index.md) |
| OIDC sign-in and account linking | Not found | Provider callbacks, verified-email admission, roles, linking and recovery | [Guide](./using-seerr/settings/users/oidc.md) |
| Jellyfin Quick Connect-only mode | Baseline Quick Connect | Administrator can disable password/bridge sign-in | [Guide](./using-seerr/settings/users/index.md) |
| Jellyfin bridge | Not found | Optional separately installed bridge; native auth remains available | [Guide](./integrations/jellyfin-seerrng-bridge.md) |
| Import profile refresh | Baseline user import | Opt-in provider-name/avatar refresh preserving local account data | [Guide](./using-seerr/users/adding-users.mdx) |
| Administrator network restrictions | Not found | Restrict administrator sign-in to configured trusted networks | [Guide](./using-seerr/settings/network.md) |
| Family age gate | Not found | Category access and administrator-managed household age policy | [Guide](./using-seerr/age-gate.md) |
| Built-in HTTPS | Reverse proxy documented | Administrator-controlled TLS/HTTP transport and certificate guidance | [Guide](./using-seerr/advanced/built-in-tls.mdx) |
| Scoped client API keys | Global API key baseline | Per-client discover/request authorization, profile token management and revocation | [Guide](./using-seerr/client-api-keys.md) |

## Interface and clients

| Capability | Seerr | SeerrNG source behavior and requirements | In-repo guide |
| --- | --- | --- | --- |
| Responsive native web interface | Shared | Movie/TV heritage plus cross-media pages | [Guide](./interface-themes/feature-map.md) |
| SeerrOrig, John and Persius themes | Upstream interface | Separate native theme stylesheets and documented source fidelity | [Guide](./interface-themes/feature-map.md) |
| Installable community theme packages | Not found | .seerrtheme manifest, validation and packaging | [Guide](./interface-themes/authoring.md) |
| Included Lumen | Not found | Bundled frontend on normal 5055 listener; optional companion | [Guide](./using-seerr/lumen.md) |
| Default-interface selection and native escape | Not found | General native/included/external selection; /seerrng remains available | [Guide](./using-seerr/lumen.md) |
| Lumen default for every existing user | Not found | Partial: fresh defaults exist; safe all-existing-user migration remains unfinished | [Guide](./maintainers/lumen-single-container-remaining-work.md) |
| Lumen companion import and included storage parity | Not found | Planned: checked import and actual included-storage diagnostics remain unfinished | [Guide](./maintainers/lumen-single-container-remaining-work.md) |
| Subject tags and detail preferences | Baseline detail sections | Persistent visibility, disclosure pins and section ordering | [Guide](./using-seerr/media-details-and-playback.md) |
| Android client | Responsive website | Server-switching APK with per-server browser profiles | [Guide](./getting-started/android-app.md) |
| iOS client | Responsive website | Source client and build/distribution readiness; do not infer App Store availability | [Guide](./getting-started/ios-app.md) |
| Browser extension | Not bundled | Optional SeerrNG Companion; separate installation/project | [Guide](./using-seerr/browser-extension.md) |
| Offline browsing and recovery | Baseline in-memory caching | Account-partitioned runtime cache and reconnect/retry utility page | [Guide](./using-seerr/offline-and-caching.md) |
| Metadata/image caching | Baseline provider caches | Persistent public-metadata reuse, bounded refresh, image warming and cache controls | [Guide](./using-seerr/offline-and-caching.md) |

## Operations and compatibility

| Capability | Seerr | SeerrNG source behavior and requirements | In-repo guide |
| --- | --- | --- | --- |
| SQLite and PostgreSQL | Shared | Supported database backends | [Guide](./getting-started/index.mdx) |
| Docker and source installations | Shared | SeerrNG image, data paths and native runtime requirements | [Guide](./getting-started/docker.mdx) |
| Setup assistant | Not found | Cross-platform preview and guided provider setup | [Guide](./using-seerr/setup-assistant.md) |
| Kubernetes/Helm | Shared baseline | Signed chart, maintenance at zero replicas; multiple app replicas rejected | [Guide](./getting-started/kubernetes.mdx) |
| Unraid packaging | Third-party integrations | SeerrNG-specific template and /app/config mapping | [Guide](./getting-started/third-parties/unraid.mdx) |
| Backup and restore | Shared baseline | Back up database/settings and provider-sensitive state | [Guide](./using-seerr/backups.md) |
| Seerr/SeerrNG migration utility | Not found | Preview-first data/settings transition with explicit scope and rollback | [Guide](./using-seerr/migrating-between-seerr-and-seerrng.md) |
| Book path migration | Not found | Administrator preview, conflicts, capacity checks and confirmed moves | [Guide](./using-seerr/bookshelf-media-path-migration.md) |
| Readarr/softcover-to-Hardcover migration | Not found | Resumable matching, validation and opt-in local fallback | [Guide](./using-seerr/bookshelf-hardcover-migration.md) |
| BookshelfNG-to-ChaptarrNG retirement | Not found | Preview tooling exists; apply/cutover remains gated by companion-project acceptance | [Guide](./using-seerr/bookshelf-backend.md) |
| Third-party video client compatibility | Upstream API | Compatibility DTOs and explicit unsupported cross-media boundaries | [Guide](./using-seerr/third-party-client-compatibility.md) |
| Public API schema | Shared OpenAPI baseline | Cross-media contracts plus watchlist and permission-aware response alignment | [Guide](./maintainers/openapi-api-contract.md) |
| Localization | Shared translated UI | Expanded catalogues with coverage/review roadmap and English fallback | [Guide](./localization-roadmap.md) |
| Security scanning and signed artifacts | Shared security/release foundations | Fork-specific scan/signature tooling; coverage is not a security guarantee | [Guide](./security-scanning.md) |

## Maintain this comparison

When changing a user-facing capability, update its row and usage guide together.
For a new capability, add a row and a guide with where to find it, prerequisites,
permissions, expected behavior, limitations and recovery. An API-only capability
must say so. Recheck upstream before changing a status to **Not found**; pin the
reviewed source instead of inferring availability from an open or closed issue.

End every linked guide with **Sources and attribution**. Link the originating
issue, PR or public report and preserve named source authors where known. Separate
source inspiration from direct code adoption, and separate both from release
status. Keep existing licenses and source credits. If provenance is not recorded,
say so rather than inventing an upstream ticket. The source ledger's referenced
or in-progress section remains a reference list, not an implemented-feature list.

Every documentation build runs the inventory check automatically. You can also
validate it with `node scripts/check-feature-comparison.mjs`, then run
the documentation-site build when changing routes or Markdown/MDX links.

## Sources and attribution

The upstream baseline is checked against Seerr's
[pinned README](https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/README.md),
[stable source](https://github.com/seerr-team/seerr/tree/564bfb08b54caa374bddaf820abfd226e5e69151)
and [development source](https://github.com/seerr-team/seerr/tree/3f7d5c3bd2aff1af49f4a06e277f7dee0c2f2f14).
The fork inventory comes from SeerrNG's README, user guides, routes and settings.
Specific reports and contributions are credited in the linked guides and the
[public source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) preserves
upstream and third-party licensing and attribution. SeerrNG-specific comparison
work is maintained by snapetech and SeerrNG contributors.
