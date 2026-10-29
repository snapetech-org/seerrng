---
title: Search across SeerrNG
description: Use the shared Search page to find catalog titles, available media, requests, and Prowlarr releases.
---

# Search across SeerrNG

Open **Search** from the main navigation or use the search field in the header.
The shared page keeps catalog discovery, available titles, requests, and manual
Prowlarr searches under one entry point. The URL retains the query so a search
can be shared or revisited.

## Search scopes

- **All** searches the enabled SeerrNG media catalogs. Choose a media category
  to narrow the results. Audiobook searches also query ReadMeABook when it is
  connected. The All view can show a compact software catalog preview and
  ReadMeABook results alongside the main catalog results. Use the software
  category for the full software catalog.
- **Library** searches catalog titles SeerrNG marks available or partially
  available, including available software. It describes SeerrNG catalog
  availability; it does not search the personal Plex, Jellyfin, Emby, Trakt,
  AniList, or Simkl library browser.
- **Requests** searches request status and lets you apply the request list's
  status, media, date, user, and sort filters while keeping the shared query.
- **Releases** opens the manual Prowlarr search for users with **Manage
  Requests** permission. When you switch from a media category, Search carries
  that category into Releases when Prowlarr supports it. Submit the release
  search explicitly; sending a result to Prowlarr's download client is a
  separate action and does not create a SeerrNG request.

The former `/indexer-search` URL redirects to **Search > Releases** and keeps
its query and category parameters.

## Contextual search actions

- Music results offer **Identify a Song**, which opens SongID with the search
  text prefilled. It does not start an identification job.
- Book and audiobook results can show inline book series matches when the
  relevant catalogs are enabled.
- Request dialogs, service-specific download lookups, Live TV guide searches,
  and administration settings search remain inside their task-specific
  workflows, where results have the correct actions and permissions.

For Prowlarr setup, category coverage, result privacy, and manual handoff
behavior, see [Indexer searches by media category](./indexer-searches.md).
