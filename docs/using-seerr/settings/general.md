---
title: General
description: Configure global and default settings for Seerr.
sidebar_position: 1
---

# General

## API Key

This is your Seerr API key, which can be used to integrate Seerr with third-party applications. Do **not** share this key publicly, as it can be used to gain administrator access!

If you need to generate a new API key for any reason, simply click the button to the right of the text box.

If you want to set the API key, rather than letting it be randomly generated, you can use the API_KEY environment variable. Whatever that variable is set to will be your API key.

## Application Title

If you aren't a huge fan of the name "Seerr" and would like to display something different to your users, you can customize the application title!

## Application URL

Set this to the externally-accessible URL of your Seerr instance.

You must configure this setting in order to enable password reset and generation emails.

## Enable Image Caching

When enabled, Seerr will proxy and cache images from pre-configured sources such as TMDB, TVDB, Cover Art Archive, TheAudioDB, Open Library Covers, and Internet Archive. This can use a significant amount of disk space.

Images are saved in `config/cache/images`, and stale images are cleared out every 24 hours.

You should enable this if you are having issues loading external images directly in your browser, or if you want repeat page loads to reuse Seerr's local image cache. When enabled, Seerr also warms visible media images opportunistically so the first viewport is prioritized before off-screen content.

## Display Language

Set the default display language for Seerr. Users can override this setting in their user settings.

## Version Check

When enabled, SeerrNG checks the public release tags in the SeerrNG GitHub repository. It only reports an update when a published stable tag is newer than the installed version, so a build created ahead of the next public release is not incorrectly marked as out of date.

## Theme and color palette

Open the paintbrush menu in the top-right corner to choose light or dark mode and a color palette. **Seerr** is SeerrNG's default blue-gray appearance when the browser has no saved palette preference.

The **SeerrNG** palette provides a separate navy, blue, and sky treatment. Theme choices are stored in the current browser, not in the Seerr server configuration. A saved choice is preserved when Seerr is upgraded, and it does not change the palette for other installations.

## Discover Region, Discover Language & Streaming Region

These settings filter content shown on the "Discover" home page based on regional availability and original language, respectively. The Streaming Region filters the available streaming providers on the media page. Users can override these global settings by configuring these same options in their user settings.

## Blocklist Region and Blocklist Language

These settings control the region and language used specifically for blocklist content scanning. The "Process Blocklisted Tags" job uses these settings to determine which content to scan for blocklisting, independent of the general Discover settings.

- **Blocklist Region**: The region used for blocklist content scanning. Leave empty to scan all regions.
- **Blocklist Language**: The language used for blocklist content scanning. Leave empty to scan all languages.

These settings are separate from the general "Discover Region" and "Discover Language" settings, allowing you to blocklist content from specific regions/languages regardless of what users see in their Discover pages.

## Blocklist Content with Tags and Limit Content Blocklisted per Tag

These settings blocklist any TV shows or movies that have one of the entered tags. The "Process Blocklisted Tags" job adds entries to the blocklist based on the configured blocklisted tags. If a blocklisted tag is removed, any media blocklisted under that tag will be removed from the blocklist when the "Process Blocklisted Tags" job runs.

The limit setting determines how many pages per tag the job will process, with each page containing 20 entries. The job cycles through all 16 available discovery sort options, querying the defined number of pages to blocklist media that is most likely to appear at the top of each sort. Higher limits will create a more accurate blocklist, but will require more storage.

Blocklisted tags are disabled until at least one tag is entered. These settings cannot be overridden in user settings.

## Hide Available Media

When enabled, media which is already available will not appear on the "Discover" home page, or in the "Recommended" or "Similar" categories or other links on media detail pages.

Available media will still appear in search results, however, so it is possible to locate and view hidden items by searching for them by title.

This setting is **disabled** by default.

## Other Users' Availability

This setting controls how movie and TV availability appears for a viewer who does not have an approved or completed request for the matching copy. Choose to show the existing shared availability, mark it as shared, or hide its availability indicator. HD and 4K are evaluated separately, as are individual TV seasons.

This is a display preference, not an access control. SeerrNG cannot determine whether a media-server account can play a particular item; configure library permissions in Plex, Jellyfin, or Emby. Playback links in SeerrNG are hidden for shared copies when either non-default mode is selected.

The default is **Show Availability for Everyone**, which preserves the existing display.

## Hide Blocklisted Items

When enabled, media that has been blocklisted will not appear on the "Discover" home page, for all administrators. This can be useful to hide content that you don't want to see, such as content with specific tags or content that has been manually blocklisted when you have the "Manage Blocklist" permission.

This setting is **disabled** by default.

## Hide Requested Media

When enabled, media that has been requested (but not yet available) will not appear on the "Discover" home page, or in the "Recommended" or "Similar" categories or other links on media detail pages.

Requested media will still appear in search results, however, so it is possible to locate and view hidden items by searching for them by title.

This setting is **disabled** by default.

## Allow Partial Series Requests

When enabled, users will be able to submit requests for specific seasons of TV series. If disabled, users will only be able to submit requests for all unavailable seasons.

This setting is **enabled** by default.
