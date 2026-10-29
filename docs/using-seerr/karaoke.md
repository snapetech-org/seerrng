---
title: Karaoke
description: Search a connected Karaoke Mugen songbook and send requests to its shared queue.
sidebar_position: 26
---

# Karaoke

SeerrNG can connect to a self-hosted Karaoke Mugen instance. Search its songbook, check whether a song is local or remote, add a song to the public request queue, follow timed lyrics for the current song in SeerrNG, use a full-screen stage view, and control playback if you have request-management permission.

Karaoke Mugen supplies the song catalogue, karaoke media playback, singer rotation and session rules. When Mugen provides timed text lyrics, SeerrNG follows the current player position and highlights the active line; songs with hardsubbed or unavailable lyrics continue on the external Mugen display. SeerrNG keeps its connection credentials on the server and applies its own user permissions before forwarding guest requests. Each SeerrNG account gets a stable temporary Mugen guest identity, so quota history follows the account when its display name changes. SeerrNG updates that guest's Mugen nickname to the current display name and adds a short unique suffix.

## Configure the connection

Set these variables on the SeerrNG server and restart it:

| Variable | Purpose |
| --- | --- |
| **SEERRNG_KARAOKE_MUGEN_URL** | Server-side URL for the Karaoke Mugen Socket.IO endpoint, for example **http://karaoke-mugen:8000**. |
| **SEERRNG_KARAOKE_MUGEN_USERNAME** | Karaoke Mugen operator account used for catalogue, session, and host-control access. |
| **SEERRNG_KARAOKE_MUGEN_PASSWORD** | Password for that account. It is never returned to the browser. |
| **SEERRNG_KARAOKE_MUGEN_PLAYER_URL** | Optional URL your browser can open to show the Karaoke Mugen player. This may differ from the server-side URL. |

Keep the server URL reachable only from SeerrNG and trusted services. Use HTTPS when the connection crosses an untrusted network. Leave the integration unconfigured to hide provider actions.

Karaoke Mugen's public interface must be **Open**, **AllowGuestLogin** and **AllowCustomTemporaryGuests** must be enabled, and a public request playlist must exist. SeerrNG creates one stable temporary guest identity per SeerrNG account and updates its display nickname when needed. That lets Karaoke Mugen apply quotas and other per-singer rules consistently, even if a user renames their profile. Requests use Mugen's guest-facing public-queue API, so blacklist, duplicate rules, quotas, and rotation remain in force. The public playlist must be configured for host review if you want approval before songs join the active playback queue.

## Use karaoke

1. Open **Karaoke** under **Music**.
2. Search by song title or singer. Filter by language and song type, sort by request popularity, recently added, most played, or recent play history, then page through large result sets.
3. Check the language, song type, warning badge, and media status.
4. Request a result to add it to the shared public queue. If host review is enabled, the request waits for a host decision; Mugen reports its queue position when available.
5. Users can cancel their own pending requests. Users with **Manage Requests** can accept or reject requests, reorder approved songs under **Up next**, and play, pause, skip, or go back to the previous song. **More playback controls** includes stop-after-current, seek, volume, mute, and show/hide lyrics commands. Use **Open stage view** for large, synchronized current and upcoming lyrics on a separate screen. Hosts can play, pause, or skip there, and the view includes a link to the Karaoke Mugen display. Press Escape or **Close stage view** to return.

A song marked **Remote** is present in Karaoke Mugen's catalogue but not stored locally. Whether it can stream depends on that Mugen repository and its configuration. **Downloading** means it is not yet ready on that instance.

This integration does not proxy song media through SeerrNG. Catalogues, lyric files, media files, and playback stay with the configured Karaoke Mugen instance.
