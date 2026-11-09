---
title: Per-user movie and TV availability
description: Understand how SeerrNG checks movie and TV availability against each linked media-server account.
---

# Per-user movie and TV availability

SeerrNG can show movie and series availability according to the signed-in
user's own Plex, Jellyfin, or Emby library access. A title being present in the
server-wide scan does not by itself mean that every household member can play
it.

## Requirements

- The administrator has configured Plex, Jellyfin, or Emby as SeerrNG's main
  media server and completed a library scan. See [media-server setup](./settings/mediaserver.mdx).
- The SeerrNG user has a linked account for that same media server. Check
  **Profile → Settings → Linked Accounts**. Signing in with a local password
  alone does not provide the provider identity needed for an account-scoped
  check.
- The library scan has stored the native media-server item identity for the
  movie or series. SeerrNG does not guess an item from its title when that link
  is missing.

If the user has no linked media-server account, SeerrNG keeps the existing
server-wide availability display. If an account is linked but the server,
credential, item identity, or season information cannot be verified, SeerrNG
shows the affected availability as **Unknown** and hides its direct playback
link until a later check succeeds.

## What is checked

SeerrNG checks the exact Plex rating key or Jellyfin/Emby item ID recorded by
the library scan, using the viewer's linked provider identity. Movie and TV
checks are separate for standard and 4K copies. For TV, the linked account's
visible seasons are compared with the seasons SeerrNG marked available:

- A season the viewer cannot access is no longer shown as available.
- A series with both visible and restricted available seasons is shown as
  partially available.
- If the server returns no visible seasons, or the season list cannot be
  verified, the series is shown as Unknown.
- A playback link is hidden when its media-server item or available seasons
  cannot be verified for the viewer.

These results appear on Movie and Series details, related Discover cards,
Recently Added availability views, local HD and 4K Discover results, request
responses, and Request Status. Recent and Discover filters omit titles whose
availability cannot be confirmed for the linked account.

Recent and local Discover pages are sliced from SeerrNG's indexed results
before viewer access is applied. A page can therefore contain fewer results,
and its page totals describe indexed candidates rather than only items verified
for that account.

## Request destinations

The check uses the main configured media server. An availability record from a
different Radarr or Sonarr destination cannot prove that the viewer can play
the item, so that alternate destination is shown as Unknown until it matches a
verified primary media-server record. Duplicate checks and request completion
also use the selected Radarr or Sonarr destination; availability on one server
does not complete a request sent to another.

This display does not change Plex, Jellyfin, or Emby permissions. SeerrNG does
not grant library access or change provider ACLs. Ask the server administrator
to share restricted libraries or items. The provider remains responsible for
enforcing playback access.

## Troubleshooting

If a title that should be available appears as Unknown, check that the user's
provider account is linked, the linked account can access the item and its
seasons, and the media-server library scan has completed. A temporary provider
error also fails closed; SeerrNG retries after its short availability cache
expires. A server-wide scan status is preserved, so one user's restricted
view does not change what another user's account can access.

## Upstream context

This SeerrNG behavior adapts the per-user library-access request discussed in
Seerr [issue #180](https://github.com/seerr-team/seerr/issues/180) and
[pull request #3296](https://github.com/seerr-team/seerr/pull/3296). The
SeerrNG implementation verifies items with the linked viewer's identity and
does not modify provider permissions.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [Upstream Seerr issue #180](https://github.com/seerr-team/seerr/issues/180) — [@ghost](https://github.com/ghost).
- [Upstream Seerr issue #1744](https://github.com/seerr-team/seerr/issues/1744) — [@LaurenceBarnes](https://github.com/LaurenceBarnes).
- [Upstream Seerr PR #3296](https://github.com/seerr-team/seerr/pull/3296) — [@Izakun](https://github.com/Izakun).

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
