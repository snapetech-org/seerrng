---
slug: /
sidebar_position: 1
---

# SeerrNG Documentation

SeerrNG brings movie, television, music, book, comic, magazine, adult-scene,
emulation, and PC game requests into one self-hosted app. These guides cover installation,
request workflows, download copies, user settings, and the services SeerrNG
connects to.

## Start here
- [Localization coverage and roadmap](/localization-roadmap): current supported locales, catalog coverage, and remaining translation work.

- [SeerrNG Android app](/getting-started/android-app): install the APK and add or switch between servers.

- [Getting started](/getting-started/): choose an installation method and
  connect SeerrNG to your media server.
- [Docker installation](/getting-started/docker/)
- [Kubernetes installation](/getting-started/kubernetes/)
- [Unraid installation](/getting-started/third-parties/unraid)
- [Cross-platform setup assistant](/using-seerr/setup-assistant)
- [Troubleshooting](/troubleshooting/)

## Use SeerrNG

- [Filter movie and series discovery by rating or streaming service](/using-seerr/movie-series-discovery-filters/)
- [Customize Discover shelves and navigation](/using-seerr/discover/)
- [Filter and sort local watchlists](/using-seerr/plex/watchlist-auto-request/#find-items-in-your-watchlist)
- [Follow another user's active request](/using-seerr/notifications/#follow-a-movie-or-series-request)
- [Approve or decline requests from Slack](/using-seerr/notifications/slack/#approve-or-decline-requests-from-slack)
- [Hide Subject Tags on movie and series pages](/using-seerr/media-details-and-playback/#hide-subject-tags)
- [Require previous-season watch progress](/using-seerr/settings/general/#require-the-previous-season-to-be-watched)
- [Choose how other users' movie and TV availability appears](/using-seerr/settings/general/#other-users-availability)
- [Find books, authors, and series](/using-seerr/books-and-series/)
- [Browse, request, and track sports leagues with Sportarr](/using-seerr/sportarr/)
- [Follow requests and status history](/using-seerr/request-status/)
- [Understand request defaults and overrides](/using-seerr/request-defaults/)
- [Opt in to the TV episode queue with Plex, Jellyfin, or Emby playback](/using-seerr/jellyfin-watch-ahead/)
- [Browse and request ROMs and PC games](/using-seerr/software-acquisition/)
- [Discover and request adult scenes with Whisparr](/using-seerr/adult-media/)
- [Track games and find household overlaps](/using-seerr/game-library/)
- [See where indexer searches run by media category](/using-seerr/indexer-searches/)
- [Download verified files from Request Status](/using-seerr/request-status/)
- [Media details and playback controls](/using-seerr/media-details-and-playback/)
- [Optional native desktop playback](/using-seerr/native-desktop-playback/)
- [Import a playlist as music requests](/using-seerr/playlist-requests/)
- [Manage users and request preferences](/using-seerr/users/editing-users/)
- [Configure notifications](/using-seerr/notifications/)
- [Configure Slack notifications](/using-seerr/notifications/slack/)
- [Configure Telegram notifications](/using-seerr/notifications/telegram/)
- [Hide requested or available media](/using-seerr/settings/general)
- [Plex watchlist auto-requests](/using-seerr/plex/watchlist-auto-request/)

## Share, continue, compare, and follow

- [Share to Request: links, ISBNs, lists, and photos](/using-seerr/share-to-request)
- [Continue an anime, compare editions, and find games and patches](/using-seerr/cross-media-discovery)
- [Following](/using-seerr/following)
- [SeerrNG Companion browser extension](/using-seerr/browser-extension)
- [Troubleshoot cross-media features](/using-seerr/cross-media-troubleshooting)
- [Cross-media plan and build record](/maintainers/cross-media-discovery-plan)

## Configure and operate

- [Configure OIDC sign-in, provider callbacks, account admission, linking, and recovery](/using-seerr/settings/users/oidc)
- [Cross-project OIDC contract and rollout map](/maintainers/oidc-cross-project-template) · [provider IDs, official setup links, scopes, and caveats](/maintainers/oidc-provider-catalog)
- [Choose metadata providers and configure music request limits](/using-seerr/settings/metadata/)
- [Check MusicBrainz and Cover Art Archive connectivity](/using-seerr/settings/metadata/#music-metadata-providers)
- [Configure media and automation services](/using-seerr/settings/services/)
- [Set up labeled movie and TV request destinations](/using-seerr/settings/services/#request-destination-label-optional)
- [Configure Sonarr v5 and alternate season orders](/using-seerr/settings/services/)
- [Configure request-limit exceptions](/using-seerr/settings/users/)
- [Choose available media categories](/using-seerr/settings/media-categories/)
- [Configure media-server libraries](/using-seerr/settings/mediaserver)
- [Choose and configure companion services](/using-seerr/companion-services)
- [What each cross-media feature needs](/using-seerr/cross-media-requirements)
- [Set up image recognition for Share to Request](/using-seerr/share-to-request/#administrators)
- [Companion service integrations](/using-seerr/dependency-forks/)
- [Configure ChaptarrNG and its SeerrNG service key](/using-seerr/bookshelf-backend/#chaptarrng)
- [Connect Bindery for ebook and audiobook requests](/using-seerr/bindery-backend)
- [Preview a BookshelfNG-to-ChaptarrNG migration](/using-seerr/bookshelf-backend/#installer-script)
- [Connect read-only Audiobookshelf availability](/using-seerr/bookshelf-backend/#audiobookshelf-availability)
- [Enable built-in HTTPS](/using-seerr/advanced/built-in-tls)
- [Create override rules](/using-seerr/override-rules/)
- [Bookshelf backend setup](/using-seerr/bookshelf-backend/)
- [Connect e-readers with Grimmory or BookOrbit](/using-seerr/reader-delivery/)
- [Bookshelf metadata sources](/using-seerr/bookshelf-metadata-sources/)
- [Migrate a Bookshelf library to Hardcover](/using-seerr/bookshelf-hardcover-migration/)
- [Network and transport settings](/using-seerr/settings/network/)
- [Back up SeerrNG](/using-seerr/backups/)

## Integrate and contribute
- [Setup experience contract](/maintainers/setup-experience-contract): evolve the existing first-run, category, and service surfaces.

- [Why SeerrNG maintains a fork and what a replacement must provide](/fork-rationale/)
- [REST API reference](/api/seerr-api/)
- [Third-party client compatibility](/using-seerr/third-party-client-compatibility/)
- [Contribution guidelines](https://github.com/snapetech-org/seerrng/blob/main/CONTRIBUTING.md)
- [Support on Discord](https://discord.gg/5PyXBfvS6T)
