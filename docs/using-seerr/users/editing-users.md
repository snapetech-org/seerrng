---
title: Editing Users
description: Edit user settings and permissions.
sidebar_position: 3
---

# Editing Users

From the **User List**, you can click the **Edit** button to modify a particular user's settings.

You can also click the check boxes and click the **Bulk Edit** button to set user permissions for multiple users at once.

## General

### Display Name

You can optionally set a "friendly name" for any user. This name will be used in lieu of their media server (Jellyfin/Emby/Plex) username (for users imported from the media server) or their email address (for manually-created local users).

### Email

:::note
This field is read-only for users imported from Plex.
:::
You can optionally set a proper email address for any user. This email address will be used for notifications, local sign-in and password resets.

By default, users imported from Jellyfin/Emby will use their media server username as their email address.

:::warning
You cannot leave this field blank.
:::

### Display Language

Users can override the [global display language](/using-seerr/settings/general#display-language) to use Seerr in their preferred language.

### Preferred Request Languages

Set **Preferred Language for All Media** to choose a default language for new
requests. The **Movie Language Override**, **Series Language Override**,
**Music Language Override**, and **Book Language Override** fields can each
inherit that default, allow any language, or select a separate language.

When a matching Radarr or Sonarr language profile is available, SeerrNG uses it
for movie or series requests. For books, a matching edition is selected when
the catalog provides one. Music language preferences are saved, but connected
music services do not currently provide a language-based request choice.
Requesters can still change the destination or book edition in the request
dialog.

### Media Categories and Indexer Details

Under **General**, choose which media categories are available to this user.
The user can change these choices in their own profile settings, and **Use
administrator defaults** resets them to the settings configured for new users.
Administrators always see categories that are enabled globally.

Prowlarr indexer names and detail links are hidden unless the administrator
allows them under **Settings > Prowlarr**. When that global option is enabled,
you can hide indexer details for this user from the same **General** page.
Only user managers can change that per-user setting. Turning the global option
off hides details for everyone.

### Discover Region & Discover Language

Users can override the [global filter settings](/using-seerr/settings/general#discover-region-discover-language--streaming-region) to suit their own preferences.

### Movie Request Limit & Series Request Limit

You can override the default settings and assign different request limits for specific users by checking the **Enable Override** box and selecting the desired request limit and time period.

Unless an override is configured, users are granted the global request limits.

Note that users with the **Manage Users** permission are exempt from request limits, since that permission also grants the ability to submit requests on behalf of other users.

Users are also unable to modify their own request limits.

## Maturity Controls

Users with the **Manage Users** permission can set separate movie and TV rating
limits for an account. These caps apply to the account even when the instance
age-gate default is disabled. See [Age gate](../age-gate.md) for rating rules
and how account limits work with the instance-wide family controls.

## Password

All "local users" are assigned passwords upon creation, but users imported from Plex can also optionally configure passwords to enable sign-in using their email address.

Passwords must be a minimum of 8 characters long.

## Notifications

Users can configure their personal notification settings here. Please see [Notifications](/using-seerr/notifications/) for details on configuring and enabling notifications.

## Permissions

Users cannot modify their own permissions. Users with the **Manage Users** permission can manage permissions of other users, except those of users with the **Admin** permission.

### Request Destinations

Under **Request destinations**, grant a user access to labeled, non-default
Radarr or Sonarr instances. The user must still have the usual movie or series
request permission. They can choose a granted destination in the request
dialog; the default service remains available as before.

These grants apply only to the selected service instance. They do not grant
advanced request permissions or let the user choose profiles, root folders,
language profiles, or tags. Anime-only destinations appear only for titles
SeerrNG identifies as anime.
