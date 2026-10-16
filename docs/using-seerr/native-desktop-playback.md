---
slug: /using-seerr/native-desktop-playback
sidebar_position: 12
---

# Native desktop playback

SeerrNG can hand a supported Jellyfin item to a compatible Foreseer Desktop
client so it plays in the same desktop window. The desktop client is optional;
SeerrNG continues to work in a regular browser without it.

## Requirements

- A compatible Foreseer Desktop release with native protocol v1 support. See
  the [Foreseer Desktop repository](https://github.com/selmant/foreseerr-desktop)
  for current versions and platform support.
- SeerrNG served over HTTPS, using built-in TLS or a trusted HTTPS reverse
  proxy. Native authentication tickets and Jellyfin credentials are refused
  over plain HTTP.
- SeerrNG configured to use Jellyfin, with your Jellyfin account linked in your
  SeerrNG user profile.
- The desktop client configured in remote mode to open your SeerrNG address.
  Follow the [Foreseer Desktop setup guide](https://selmant.github.io/foreseerr/using-seerr/native-desktop/)
  for its remote-mode setup.

Foreseer Desktop is a third-party project, not a SeerrNG fork or bundled
component. SeerrNG implements its public
[protocol v1 contract](https://github.com/selmant/foreseerr-desktop/blob/main/protocol/protocol-v1.json).
For a SeerrNG connection or playback handoff issue, use the
[SeerrNG issue tracker](https://github.com/snapetech-org/seerrng/issues). Report
desktop installation, runtime, or windowing issues to the
[Foreseer Desktop maintainers](https://github.com/selmant/foreseerr-desktop/issues).

## Playback behavior

When the desktop client is ready, playing one supported Jellyfin item starts it
in the current desktop window. Jellyfin Web handles resume position, stream
selection, and playback reporting. SeerrNG's normal browser playback stays
available when the desktop client is missing, not ready, or rejects the item.
After a desktop playback error, use the play control again to open the browser
fallback.

Native handoff currently applies to one selected Jellyfin library item at a
time. Multiple-item playlists, collection playback, 4K variants, trailers, and
other media servers continue through SeerrNG's existing browser playback flow.
An ordinary browser never receives the linked Jellyfin token: a short-lived
single-use ticket is redeemed by the native client after a session-bound
challenge.

If native playback does not start, confirm that you are signed in to SeerrNG,
the account is linked to the expected Jellyfin user, SeerrNG is served over
HTTPS, and the desktop client is using the same SeerrNG address. Then use browser
playback or report the SeerrNG integration problem in the
[SeerrNG issue tracker](https://github.com/snapetech-org/seerrng/issues).
