---
title: Navidrome
description: Mark music you already have in a Navidrome library as available.
sidebar_position: 25
---

# Navidrome

SeerrNG can read a [Navidrome](https://www.navidrome.org/) music library on a
schedule and mark albums it finds as available. Albums are matched by
MusicBrainz ID, so Navidrome albums need that tag to be matched.

This connection is read-only. SeerrNG does not add, change, or remove anything
in Navidrome.

## Connect a server

1. Open **Settings > Services** and find **Navidrome Availability**.
2. Select **Connect Navidrome Server**.
3. Enter the server URL, for example `http://navidrome:4533`, and the username
   and password of an account that can browse the music library.
4. Select **Test Connection**, then **Connect**.

The password stays on the SeerrNG server. The API sends it only as a Subsonic
token, never in plain text.

## Scheduled scan

The **Navidrome Scan** job runs daily at 05:15 and reads the library in pages.
A library larger than 100,000 albums is not scanned, because a partial scan
could be misread as a smaller library.

Turn off **Sync Availability During the Scheduled Scan** to pause scanning
without removing the connection.

:::info
Albums that Navidrome marks available stay available until a later scan or
request update changes them. Disconnecting Navidrome stops future scans but does
not clear those albums.
:::

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
