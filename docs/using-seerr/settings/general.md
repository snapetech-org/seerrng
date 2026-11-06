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

When enabled, SeerrNG checks the public release tags in the SeerrNG GitHub repository. It only reports an update when a published stable tag is newer than the installed version, so a build created ahead of the next public release is not incorrectly marked as out of date. Successful release or commit lookups are cached for six hours; a failed lookup is held for five minutes before retry so frequent status polling does not repeat the same GitHub request.

## Theme and color palette

Open the paintbrush menu in the top-right corner to choose light or dark mode and a color palette. **Seerr** is SeerrNG's default blue-gray appearance when the browser has no saved palette preference.

The **SeerrNG** palette provides a separate navy, blue, and sky treatment. Theme choices are stored in the current browser, not in the Seerr server configuration. A saved choice is preserved when Seerr is upgraded, and it does not change the palette for other installations.

## Discover Region, Discover Language & Streaming Region

These settings filter content shown on the "Discover" home page based on regional availability and original language, respectively. The Streaming Region filters the available streaming providers on the media page. Users can override these global settings by configuring these same options in their user settings.

## Streaming Availability Request Policy

Administrators can enable a rule for new movie and series requests based on
each requester's selected streaming subscriptions and streaming region. Users
choose their subscribed services under **Profile Settings > General**;
administrators can set the same preferences from that user's **General**
settings. Availability uses the user's Streaming Region, then the global
Streaming Region, and defaults to US if neither is set.

Choose whether the rule matches titles available on at least one selected
service or titles unavailable on all selected services. Then choose to reject
matching requests, leave them pending, or approve them automatically. A pending
result can override a user's usual auto-approval
permission. Automatic approval does not bypass request permissions or quotas;
an over-quota request remains pending for quota review.

The rule is disabled by default. It uses TMDB's subscription streaming
(`Flatrate`) entries only; rent and buy listings are ignored. If the requester
has no selected services or TMDB has no availability record for their region,
the rule does not act on the request. A rejected request is stopped before it is
created and displays the configured message. If requesters may override
rejections, the request dialog offers a **Request anyway** action for each
matching request.

The optional rejection message accepts `{title}`, `{providers}`, and `{region}`
placeholders. If the message is blank, SeerrNG shows a default explanation.

## Blocklist Region and Blocklist Language

These settings control the region and language used specifically for blocklist content scanning. The **Process Blocklist Rules** job uses these settings to determine which content to scan for blocklisting, independent of the general Discover settings.

- **Blocklist Region**: The region used for blocklist content scanning. Leave empty to scan all regions.
- **Blocklist Language**: The language used for blocklist content scanning. Leave empty to scan all languages.

These settings are separate from the general "Discover Region" and "Discover Language" settings, allowing you to blocklist content from specific regions/languages regardless of what users see in their Discover pages.

## Automatic Blocklist Rules

Configure tags and genres that should automatically block movies or series. Movie and series genres are selected separately because TMDB assigns different IDs to each catalog. The **Process Blocklist Rules** job scans configured tags and genres using the blocklist region and language above.

When a tag or genre is removed from its setting, titles no longer matching any configured automatic rule are removed from the automatic blocklist the next time the job runs. Titles blocked manually remain blocked. Removing an automatic blocklist entry restores its saved media status when SeerrNG had a corresponding media record.

This is a bounded scan, not an exhaustive lookup of every TMDB title with a tag. The page limit applies to each tag, media type, and sort option, so matching titles outside the scanned pages may remain outside the automatic blocklist. The default limit is 50 pages. The job runs weekly by default; use **Settings → Jobs & Cache** to review or change its schedule, or choose **Run Now** to start a scan immediately. Running it manually does not change the schedule.

Automatic blocklisting is disabled until at least one tag or genre is entered. These settings cannot be overridden in user settings.

The page limit controls scan depth for each configured tag or genre. Each page contains up to 20 entries, and the job uses the supported discovery sorts while stopping early when TMDB has fewer results. Higher limits cover more titles and take longer to process. A limit of zero runs no discovery queries, so the next job run removes all automatically managed entries. The job aborts without reconciling existing entries if results exceed its 10,000-entry safety cap. Selections are limited to 100 IDs per field. These administrator settings cannot be overridden in user settings.

On the **Blocklist** page, the **Automatic Tags** and **Automatic Genres** filters show entries that match each source. A title matching both appears in both filtered views and only once in the full list. Its source badges identify each matching rule category.

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

When enabled, movie and TV media with an active request are hidden from Discover shelves, movie and TV result grids, and the "Recommended", "Similar", or other discovery links on media detail pages.

This also includes movie and TV media with a **Pending** or **Processing** status in either the standard or 4K library, even when no active request record remains. Titles remain available through explicit searches, including searches entered on the movie and TV discovery pages.

This setting is **disabled** by default.

## Allow Partial Series Requests

When enabled, users will be able to submit requests for specific seasons of TV series. If disabled, users will only be able to submit requests for all unavailable seasons.

This setting is **enabled** by default.

## Require the Previous Season to Be Watched

When enabled, users must watch every episode of the immediately previous regular season before requesting a later season. Special episodes and seasons with no episodes do not count toward this rule. The setting is **disabled** by default.

SeerrNG checks the requester's linked Plex, Jellyfin, or Emby playback history. The series must be present in that media server's library so SeerrNG can match its episodes. If playback history cannot be verified, later seasons stay blocked until it can be checked. When partial series requests are disabled, the request modal includes only seasons that pass the rule, so users can request the first eligible season and continue after watching it. Administrators and users with **Manage Requests** permission can override the rule.

If this global setting is off, each user can request approval from **Profile → TV Season Rule**. A user manager reviews pending requests from the **Users** page. After approval, the user can turn the rule on or off from their profile without another review. Turning on the global setting applies the rule to everyone and temporarily overrides individual choices.
