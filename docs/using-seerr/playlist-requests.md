---
sidebar_position: 21
---

# Playlist Requests

SeerrNG can turn a supported Spotify or YouTube playlist into a reviewable
music request list. SeerrNG reads the playlist, matches tracks to MusicBrainz
release groups, and then sends the albums you select through the normal Lidarr
request flow.

This is a one-time import. It does not mirror a playlist, update it in the
background, download audio, or expose Lidarr to end users.

## Administrator setup

Playlist imports require a configured default Lidarr service and the normal
music request permissions. Configure provider credentials under **Settings →
General → Playlist Integrations**.

### Spotify

1. Create an application in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add this exact redirect URI to the application:

   ```text
   https://your-seerrng-host.example/api/v1/playlist/spotify/callback
   ```

   Replace the host with the value configured in **Settings → General →
   Application URL**. The paths and trailing slash must match exactly.
3. Copy the Spotify client ID and client secret into SeerrNG.

Each user connects their Spotify account from the playlist import dialog. The
Spotify API only permits SeerrNG to read playlists that the connected account
owns or collaborates on. A public playlist owned by another account may still
be rejected by Spotify.

### YouTube and YouTube Music

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **YouTube Data API v3** for the project.
3. Create an API key and save it as **YouTube Data API Key** in SeerrNG.

Only public playlists are supported. YouTube and YouTube Music playlist links
use the same YouTube Data API.

## User workflow

1. Open **Discover → Music** and choose **Import Playlist**.
2. Paste a Spotify, YouTube, or YouTube Music playlist URL.
3. If the link is from Spotify, choose **Connect Spotify** and complete the
   sign-in flow when prompted.
4. Review the matched albums. SeerrNG selects confident matches by default.
5. Deselect anything you do not want and leave unmatched rows unselected.
6. Submit the selected albums. Quotas, permissions, approval rules, duplicate
   detection, and Lidarr routing are applied exactly as for other music
   requests.

The original provider playlist or video link remains available from the review
dialog so the match can be checked before requesting it.

## Matching behavior and limits

- A playlist import reads at most 200 source tracks in one pass.
- Spotify tracks are grouped by album before matching, so several tracks from
  one album normally produce one request candidate.
- YouTube titles are parsed using common `Artist - Track` and similar formats.
  Videos with ambiguous or incomplete titles may remain unmatched.
- Matching uses MusicBrainz release-group IDs, the same canonical music identity
  used by SeerrNG and Lidarr request handling.
- Unmatched and ambiguous rows are shown in the review list and cannot be sent
  to Lidarr until they have a confident match.
- This feature does not create or synchronize a playlist inside Lidarr. It is
  intentionally a SeerrNG-only request workflow for users who should not need
  access to the *arr administration interfaces.

Spotify access and refresh tokens are stored with the connecting user's
SeerrNG settings and are not included in normal user payloads or playlist
responses. Use **Disconnect Spotify** in the import dialog to remove that
authorization from SeerrNG.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
