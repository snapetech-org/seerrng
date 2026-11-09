---
title: Gotify
description: Configure Gotify notifications.
sidebar_position: 5
---

# Gotify

## Configuration

### Server URL

Set this to the URL of your Gotify server.

### Application Token

Add an application to your Gotify server, and set this field to the generated application token.

:::info
Please refer to the [Gotify API documentation](https://gotify.net/docs) for more details on configuring these notifications.
:::

### Priority

Set the numeric priority that Seerr sends to Gotify with each notification. Use a value supported by your Gotify server.

### Embed Poster (optional)

When enabled, Seerr adds the notification image as Gotify's large image preview when an image is available.

### Notification Language

Sets the language for notifications sent to this Gotify server.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [Upstream Seerr PR #3332](https://github.com/seerr-team/seerr/pull/3332) — [@tuvokian](https://github.com/tuvokian).

[Back to the Seerr / SeerrNG feature comparison](../../feature-comparison.md).
