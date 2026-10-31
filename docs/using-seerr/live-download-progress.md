---
title: Live download progress
description: Configure bounded Servarr queue tracking and show live download speed, seeds, and progress.
sidebar_position: 7
---

# Live download progress

By default, SeerrNG updates download progress when the scheduled **Download
Sync** job refreshes and reads the Radarr, Sonarr, Lidarr, Whisparr, and
Bookshelf/Readarr queues.
It waits for each monitored-download refresh command to finish before reading a
queue snapshot. Reads are paginated and bounded. If the refresh fails, a page is
missing, or the reported total changes between pages, SeerrNG keeps the last
verified progress state instead of treating unread items as gone. Download Sync
uses the **Download Queue Size** setting on each Radarr, Sonarr, Lidarr,
Whisparr, or Bookshelf/Readarr service under **Settings → Services**. Edit a
service to set its limit. The default is 1,000 items; choose a
whole number from 10 to 10,000. When a service has more queued items than its
limit, SeerrNG tracks only the first items returned up to that limit. Items
outside that window can appear once they move into the tracked range. This cap
affects SeerrNG progress tracking only; it does not change how the service
processes downloads.

Queue recovery and intervention use separate, uncapped snapshots with strict
completeness checks. They do not act on a queue when a complete snapshot is
unavailable or exceeds the safety bound. If you connect the torrent clients those services use, progress bars on
request and media pages update every few seconds while someone is viewing them.
Each download also shows its current speed and seed count.

SeerrNG only **reads** these clients. It never adds, pauses, moves, or removes
torrents; your *arr services keep full control of downloads.

## Supported clients

| Client | What to enter |
| --- | --- |
| qBittorrent | Web UI address, username, and password. Default port `8080`. |
| Transmission | RPC address, username, and password if RPC authentication is on. Default port `9091`. Leave **URL Base** empty to use `/transmission`. |
| Deluge | Web UI address and Web UI password. Default port `8112`. SeerrNG connects the Web UI to its first configured daemon if it is not already connected. |
| rTorrent | XML-RPC endpoint address, usually a ruTorrent `/RPC2` path, and the username and password if the endpoint uses basic authentication. Default port `80`. Leave **URL Base** empty to use `/RPC2`. |
| TorrentNG | TorrentNG address and an API token from `auth.api_tokens`. Default port `8080`. |
| SABnzbd | SABnzbd address and its API key from **Config → General**. Default port `8080`. SABnzbd reports one overall speed, so SeerrNG shows that speed on the first downloading item. |

TorrentNG is a pre-1.0 front end. It can manage an existing qBittorrent,
rTorrent, Transmission, or Deluge installation or run its own engine. When it
fronts another client, connect TorrentNG alone: it reports those torrents too,
and SeerrNG keeps only one reading for each torrent.

## Set up

1. Open **Settings → Services → System** and find **Live Download Progress**.
2. Select **Add Download Client**, choose the client, and enter its address and
   credentials. Use the same hostname and port that your *arr services use
   when SeerrNG runs on the same Docker network.
3. Select **Test** to confirm SeerrNG can sign in.
4. Select **Save Changes**.

**Refresh Interval** controls how often SeerrNG asks the clients for progress
(1–60 seconds, default 3). SeerrNG contacts the clients only while at least one
person has a downloading item open, and asks only about those downloads.

## What appears

- Progress bars and the estimated completion time update live.
- A badge beside the queue status shows the current speed and number of seeds,
  or **Stalled** when nothing is downloading and no seeds are connected.
- If a client reports an error for the torrent, the badge shows **Client Error**.

Live progress applies to torrent downloads only. Usenet downloads keep updating
through Download Sync. If no client reports a download (for example, it is in a
client that is not connected), its progress also keeps updating through
Download Sync.

## Troubleshooting

- **Test fails with a sign-in error**: check the username and password. qBittorrent
  temporarily bans an address after repeated failed logins.
- **Transmission returns HTTP 403**: add the SeerrNG host to Transmission's
  `rpc-whitelist`, or turn off the whitelist.
- **Deluge test says the Web UI is not connected to a daemon**: open the Deluge
  Web UI's Connection Manager and add the daemon once.
- After you save, the settings page shows a warning on a client whose most
  recent progress check failed.
