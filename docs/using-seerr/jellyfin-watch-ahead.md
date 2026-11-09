---
title: TV Episode Queue
description: An administrator can set a per-user buffer of upcoming TV episodes that SeerrNG requests from Sonarr as the user watches.
---

# TV Episode Queue

Episode Queue can keep up to five upcoming episodes requested in Sonarr as a
user watches through Plex, Jellyfin, or Emby. A user manager sets one default
for each account from **Users → [user] → Profile → Episode Queue**. That default
applies to the user's current and future interactive TV requests that follow the account default. Only users with
user-management permission can see or change the setting. End users cannot
request access, change the default, or override it for one show.

When the administrator has enabled Episode Queue for an account, a new TV
request starts with one selected episode. SeerrNG requests that episode first,
then asks Sonarr to keep the configured number of upcoming episodes requested
as playback progresses. Sonarr controls searching and download timing, so the
queue does not guarantee a download will finish before the next episode is
watched.

In the user manager's profile editor, the Episode Queue setting shows whether
the feature is on and the assigned buffer. The TV request dialog explains the
assigned behavior before submission. If the account is missing a playback
link, the request dialog explains the requirement and offers a link to account
settings.

## Requirements

- SeerrNG is configured to use Plex, Jellyfin, or Emby as its media server.
- The user's SeerrNG account is linked to the matching account or user on that
  media server.
- The user has permission to request the TV quality selected for the request.
- The series has a TVDB identity so playback can be matched to the request.
- A matching Sonarr destination is configured for the request's standard or 4K
  quality.

## Manage the per-user default

A user manager can set **Off** or a buffer of one to five episodes from the
user's profile. Saving a new value applies it to that user's existing
interactive root TV requests that still follow the account default and future interactive requests. Automatic
full-season requests, such as Plex Watchlist sync, keep their normal behavior
because they do not have a starting-episode selection. The confirmation
explains that episodes already requested remain in SeerrNG and Sonarr when the
setting changes.

End users see the assigned behavior in TV request flows. They do not see an
Episode Queue profile setting and cannot request access or change the default.
If Episode Queue is enabled but playback is not linked, the user can link their
own playback account from the request dialog; the administrator still
controls the queue length.

Changing the default changes future queueing only. It does not delete episodes
already created in Sonarr or the media library. Episode Queue never deletes
downloaded episodes or files.

## Override one request

Administrators can open **Requests → Episode Queue** for a pending, approved,
or completed interactive TV request. Choose **Off**, one to five episodes, or
**Account default**, then save. The pending request editor offers the same control.
An explicit override survives later account-default changes. Returning to
**Account default** uses the current default and follows future default changes.

A per-request override can enable a buffer while the account default is off.
The request owner still needs permission for the selected TV quality, and the
series needs a TVDB identity. Playback linking, destination checks, and request
approval still apply. Changing this setting preserves the original request owner,
approval, seasons, watched progress, and existing episode requests.

## What SeerrNG does

While at least one request has a buffer enabled, the worker checks active
playback every 30 seconds. A matching episode must reach at least 90% of its
runtime before the queue advances. SeerrNG matches the playing series by its TVDB identity on the configured
media server. Playback by any household viewer can advance an enrolled request;
it does not depend on the original requester watching. Plex sessions are read
through the configured server owner. Jellyfin and Emby sessions are verified
against the playing user's episode and series records. The resulting requests
retain the original request owner, approval, destination, and buffer. New episodes are reconciled at most once every 15 minutes.

While the TV request is pending approval, SeerrNG remembers watched progress
but waits to add episodes. Once the request is approved, SeerrNG checks the
selected Sonarr library and requests enough upcoming, missing episodes to
maintain the buffer. Episodes already in the library, monitored by Sonarr, or
covered by another active request count toward that buffer. Specials follow
the administrator's **Enable Special Episodes** setting.

Generated episode requests inherit the approved parent request and do not use
additional request quota. They appear in Requests with a **Requested ahead of
playback** label and do not create a separate approval notification for every
episode. Sonarr remains responsible for searching, downloading, importing, and
tracking the files.

## API

`GET /api/v1/user/{userId}/settings/episode-queue` returns the default queue
length for the signed-in user or, for a user manager, another user's profile.
`POST` to the same endpoint with `{"defaultEpisodeCount": 3}` sets the
administrator-managed default. A value of `0` turns Episode Queue off. Values
from `0` through `5` are accepted. Only users with `MANAGE_USERS` may update
the setting.

Request creation uses the request owner's saved default automatically. The
request API does not accept per-request Episode Queue overrides.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
