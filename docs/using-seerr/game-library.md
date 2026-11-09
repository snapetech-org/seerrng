---
slug: /using-seerr/game-library/
sidebar_position: 6
---

# Track games and find household overlaps

**My Games** keeps your personal collection and play progress beside SeerrNG's
existing ROM and PC-game request catalog. Catalog availability and request
status describe what SeerrNG's acquisition services are doing. Your ownership
and progress describe your own collection; those facts stay separate.

## Add and track games

Open **My Games** from the main menu. Select **Add a Game** to add a title that
does not appear in a connected catalog, or open a title in **Software** and
choose **Add to My Games**. Catalog additions start in your private backlog.
Manual entries can include a game type, progress, store or copy, and platform.

Progress can be set to **Backlog**, **Playing**, **Played**, **Completed**,
**Paused**, or **Dropped**. Ownership is a separate field. A request's approval
and download status is shown separately from your play progress.

For imported Steam games that are not matched to the PC catalog, edit the entry
and search for a catalog title. Review the result and choose **Use this match**;
SeerrNG does not automatically guess a catalog match during sync. A match links
the entry to the existing software request flow.

## Import a Steam library

An administrator can optionally [create a Steam Web API key](https://steamcommunity.com/dev/apikey)
and configure it in **Settings → Services → Software acquisition → Steam
Library Import**. The key is stored on the SeerrNG server and is never returned
to users. My Games and manual tracking work without Steam configuration.

To import your games:

1. Make **Game Details** public in your Steam privacy settings.
2. Choose **Link Steam Account** in My Games and complete Steam's sign-in page.
   SeerrNG uses Steam OpenID to verify the account; it never asks for your
   Steam password.
3. Choose **Sync Steam Library**. SeerrNG imports the titles and playtime that
   Steam makes available for the linked account.

Steam ownership and playtime are refreshed only when you sync. If a previously
owned title is absent in a successful sync, SeerrNG no longer treats Steam as
proof that you own it. Your title and progress remain. Unlinking Steam also
keeps imported titles and playtime, while clearing Steam-verified ownership and
sharing for titles you have not separately marked as owned.

## Share games with your household

Every entry is private by default. Mark a title as owned, then select **Share
with household** to include it in **Play Together**. Only games that an owner
has marked as owned and explicitly shared are shown to other signed-in users
on the same SeerrNG server. Shared cards show who owns the game, their progress,
store or platform details, and Steam playtime when present.

Play Together starts with titles shared by at least two people, which makes
overlap easy to spot. Choose **All shared games** to include titles shared by
one person. Turning sharing off removes that entry from the household view;
your personal entry and progress remain.

## Privacy and account changes

Private entries are not returned by the household endpoint. The Steam account
identifier, import status, and playtime are available only in the linked user's
personal library. Usernames and per-title facts appear in Play Together only
for an owned title whose owner has opted in to sharing.

Deleting an entry removes it from your personal library. Unlinking Steam keeps
the entries and progress so you can continue tracking them manually. A later
sync can restore Steam ownership for titles that Steam reports for the linked
account.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
