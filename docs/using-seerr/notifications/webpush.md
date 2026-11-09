---
title: Web Push
description: Configure web push notifications for your users.
sidebar_position: 2
---

# Web Push

:::warning
Web push notifications require a secure connection to your Seerr instance. Refer to the [Reverse Proxy](/extending-seerr/reverse-proxy) documentation for more information.
:::

The web push notification agent enables you and your users to receive Seerr notifications in a supported browser. This offers a native notification experience without the need to install an app.

This notification agent does not require any configuration, but is not enabled by default in Seerr.

Seerr's service worker is also used for browser runtime caching. That cache is registered independently from web push, so disabling Web Push notifications does not disable browser caching for supported API, static asset, avatar proxy, or image proxy responses.

To set up web push notifications, simply enable the agent in **Settings → Notifications → Web Push**.

### Embed Poster

When enabled, browser push notifications include the notification image when one is available.

You and your users have the option to enable web push notifications by going to your **User Profile → Edit Settings → Notifications → Web Push → Enable web push**. Here you can also customize the notifications you'd like to receive.

:::info[Mobile Users]
For Web Push notifications to work on mobile you need to add Seerr to your home screen as progressive web app (PWA).
:::

:::info[iOS Users]
On iOS you may need to enable the Safari notifications feature flag by going to **Settings → Safari → Advanced → Feature Flags** and enabling "Notifications".
:::

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [Upstream Seerr issue #2660](https://github.com/seerr-team/seerr/issues/2660) — [@diegocjorge](https://github.com/diegocjorge).
- [Upstream Seerr PR #3142](https://github.com/seerr-team/seerr/pull/3142) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3391](https://github.com/seerr-team/seerr/pull/3391) — [@fallenbagel](https://github.com/fallenbagel).

[Back to the Seerr / SeerrNG feature comparison](../../feature-comparison.md).
