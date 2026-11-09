---
title: ntfy.sh
description: Configure ntfy.sh notifications.
sidebar_position: 6
---

# ntfy.sh

## Configuration

### Server Root URL

Set this to the URL of your ntfy.sh server.

### Topic

Set this to the topic you want to send notifications to.

### Tags (optional)

Set this to a comma-separated list of [ntfy tags](https://docs.ntfy.sh/publish/#tags-emojis) to apply to notifications (for example, `eyes` or `eyes,warning`).

### Username + Password authentication (optional)

Set this to the username and password for your ntfy.sh server.

### Token authentication (optional)

Set this to the token for your ntfy.sh server.

### Priority (optional)

Set the priority level for notifications. Options range from Minimum (1) to Urgent (5), with Default (3) being the standard level. Higher priority notifications may bypass Do Not Disturb settings on some devices.

:::info
Please refer to the [ntfy.sh API documentation](https://docs.ntfy.sh/) for more details on configuring these notifications.
:::

### Notification Language

Sets the language for notifications sent to this ntfy server.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [Upstream Seerr PR #3350](https://github.com/seerr-team/seerr/pull/3350) — [@bartdelange](https://github.com/bartdelange).

[Back to the Seerr / SeerrNG feature comparison](../../feature-comparison.md).
