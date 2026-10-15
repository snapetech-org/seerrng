---
title: Companion service integrations
description: Overview of optional applications that connect to SeerrNG for book, game, and ROM requests.
sidebar_position: 7
---

# Companion service integrations

SeerrNG can connect to optional applications that handle book, game, and ROM
requests. These services run separately; SeerrNG does not bundle, install, or
start them. Enable a category only when its service is available and configured.

| Service | SeerrNG integration | Operator guide |
| --- | --- | --- |
| BookshelfNG | Book and audiobook requests, including the selected format and request status. | [Bookshelf backend setup](./bookshelf-backend.md) |
| ChaptarrNG | Book and audiobook requests, including format-specific acquisition and status. | [Bookshelf backend setup](./bookshelf-backend.md#chaptarrng) |
| QuestarrNG | PC game requests with the selected game identity, operating system, and architecture. | [Software acquisition](./software-acquisition.md) |
| ROMarrNG | ROM requests with catalog identity, platform, and request status. | [Software acquisition](./software-acquisition.md) |

## Connection setup

1. Install and configure the companion application using its operator guide.
2. In SeerrNG, open **Settings → Services** and enter the service URL and API
   credentials.
3. Test the connection and enable only the media categories that the service
   should handle.
4. Submit a request and check its status from the corresponding SeerrNG page.

Keep the service URL and credentials current. If a connection test fails, check
that the service is reachable from the SeerrNG host and that the configured
credentials have the permissions required for the selected integration.
