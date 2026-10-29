---
title: Karaoke
description: Search a connected Karaoke Mugen songbook and send requests to its shared queue.
sidebar_position: 26
---

# Karaoke

SeerrNG can connect to a self-hosted Karaoke Mugen instance. Search its songbook, check whether a song is local or remote, add a song to the public request queue, view the current session, and control playback if you have request-management permission.

Karaoke Mugen supplies the karaoke catalogue, playback, lyric rendering, singer rotation and session rules. SeerrNG keeps its connection credentials on the server and applies its own user permissions before forwarding guest requests. The user's SeerrNG display name is sent to Karaoke Mugen as the singer name.

## Configure the connection

Set these variables on the SeerrNG server and restart it:

| Variable | Purpose |
| --- | --- |
| **SEERRNG_KARAOKE_MUGEN_URL** | Server-side URL for the Karaoke Mugen Socket.IO endpoint, for example **http://karaoke-mugen:8000**. |
| **SEERRNG_KARAOKE_MUGEN_USERNAME** | Karaoke Mugen account used for catalogue and session reads. |
| **SEERRNG_KARAOKE_MUGEN_PASSWORD** | Password for that account. It is never returned to the browser. |
| **SEERRNG_KARAOKE_MUGEN_PLAYER_URL** | Optional URL your browser can open to show the Karaoke Mugen player. This may differ from the server-side URL. |

Keep the server URL reachable only from SeerrNG and trusted services. Use HTTPS when the connection crosses an untrusted network. Leave the integration unconfigured to hide provider actions.

Karaoke Mugen must allow guest sign-in and have a public playlist for requests. Its own session settings control quotas, moderation, collections, and rotation. SeerrNG creates a named guest request for each song so Karaoke Mugen can apply those settings.

## Use karaoke

1. Open **Karaoke** under **Music**.
2. Search by song title or singer.
3. Check the language, song type, warning badge, and media status.
4. Request a result to place it in the shared public queue. The Mugen server handles its normal session order and reports the queued position when available.
5. Hosts with **Manage Requests** can play, pause, or skip from SeerrNG. Open the configured player URL to display lyrics on the karaoke screen.

A song marked **Remote** is present in Karaoke Mugen's catalogue but not stored locally. Whether it can stream depends on that Mugen repository and its configuration. **Downloading** means it is not yet ready on that instance.

This integration does not proxy song media through SeerrNG. Catalogues, lyric files, media files, and playback stay with the configured Karaoke Mugen instance.
