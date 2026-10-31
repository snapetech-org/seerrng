---
title: Require Jellyfin Quick Connect for sign-in
description: Administrators can disable Jellyfin password and plugin bridge sign-in while keeping Quick Connect available.
date: 2026-10-31
---

Administrators can require Jellyfin Quick Connect for Jellyfin sign-in. The
setting hides the username and password form and the server rejects direct
password and Jellyfin plugin bridge sign-in attempts. It applies only to
Jellyfin; Emby, Plex, local-password, and OpenID Connect sign-in remain
independent. Password-based account linking from an authenticated user profile
is unchanged.

This adapts Seerr [PR #3315](https://github.com/seerr-team/seerr/pull/3315)
to SeerrNG's Jellyfin sign-in routes.
