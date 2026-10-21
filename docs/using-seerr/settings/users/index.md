---
title: User Settings
description: Configure global and default user settings.
sidebar_position: 2
---

# Users

For external identity-provider sign-in, see [OpenID Connect setup, account
linking, admission rules, and recovery](./oidc.md). SeerrNG supports multiple
providers; ordinary provider callbacks return to the page where sign-in
started, while Sign in with Apple uses its fixed callback URL.

## Enable Local Sign-In

When enabled, users who have configured passwords will be allowed to sign in using their email address.

When disabled, your mediaserver OAuth becomes the only sign-in option, and any "local users" you have created will not be able to sign in to Seerr.

This setting is **enabled** by default.

## Enable Jellyfin/Emby/Plex Sign-In

When enabled, users will be able to sign in to Seerr using their Jellyfin/Emby/Plex credentials, provided they have linked their media server accounts.

When disabled, users will only be able to sign in using their email address. Users without a password set will not be able to sign in to Seerr.

This setting is **enabled** by default.

## Enable New Jellyfin/Emby/Plex Sign-In

When enabled, users with access to your media server will be able to sign in to Seerr even if they have not yet been imported. Users will be automatically assigned the permissions configured in the [Default Permissions](#default-permissions) setting upon first sign-in.

This setting is **enabled** by default.

## Global Movie Request Limit & Global Series Request Limit

Select the request limits you would like granted to users.

Unless an override is configured, users are granted these global request limits.

Note that users with the **Manage Users** permission are exempt from request limits, since that permission also grants the ability to submit requests on behalf of other users.

When a user reaches a movie or series limit, they can ask an administrator to
approve one of their own requests from the request dialog. The pending request
continues to count against the limit, and a user can have only one quota
exception awaiting review per media type. If approved, that request no longer
counts against future quota usage. Bulk and automated requests continue to obey
the limit without creating approval requests.

## Default Permissions

Select the permissions you would like assigned to new users to have by default upon account creation.

If [Enable New Jellyfin/Emby/Plex Sign-In](#enable-new-jellyfinembyplex-sign-in) is enabled, any user with access to your media server will be able to sign in to Seerr, and they will be granted the permissions you select here upon first sign-in.

This setting only affects new users, and has no impact on existing users. In order to modify permissions for existing users, you will need to edit the users.
