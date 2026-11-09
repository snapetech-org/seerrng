---
title: Request Status
description: Follow request progress, view status history, and find incomplete requests.
---

# Request Status

Open **Requests** from the account menu to see request progress. Each card
shows the current state and, when available, the request lifecycle from
approval and searching through downloading, importing, and library
availability. Expand **History** on a card to review its recorded status
changes.

If a pending request's matching movie, series, or requested book format becomes
available through a library update, SeerrNG completes the request instead of
sending it to the acquisition service again. Active TV season selections are
completed with the request; previously declined seasons remain in the history.

Request explanations use the selected interface language. Custom details
reported by connected services remain as supplied so their diagnostic wording
is preserved.

## Find a request

Use the summary filters to view all requests, completed requests, active work,
requests needing attention, or incomplete requests. **Incomplete** helps find
requests where only part of the requested media or book formats have been
fulfilled.

The other filters can narrow the list by media type, keyword, and time period.
The time period options include the last 7, 14, or 30 days, the last 6 months,
and all time. If the page indicates older requests are outside the selected
period, choose **View All History** to include them. Users with permission to
view other users' requests can also filter by requester.

## Resolve requests that need attention

When a request has a **Retry** action, use it to restart the request from the
approval stage. Pending requests may also show management actions such as
approve, decline, or edit, depending on your permissions. Actions for deleting
status entries or removing available media are permission-controlled and
include a confirmation step.

### Automatic retries for temporary provider failures

When an approved movie or TV request cannot reach Radarr or Sonarr because of a
temporary network failure, timeout, rate limit, or server error, SeerrNG keeps
the request approved and retries it in the background. The retry delay starts
at one minute, doubles between attempts, and is capped at six hours; after 50
failed attempts the request moves to **Failed** and can be retried manually
after the provider problem is fixed. Invalid settings and other non-transient
errors remain visible for review instead of being retried repeatedly.

If Radarr or Sonarr accepted a request before its response was lost, SeerrNG
uses the existing TMDB or TVDB identity to reconcile that title during retry.
The original request and its selected destination remain attached to the
result.

For TV requests, SeerrNG can resolve a missing TVDB identifier through TVDB's
confirmed TMDB match or the selected Sonarr server's TMDB lookup. It checks
requested regular seasons against official TVDB season data before dispatch.
If the series cannot be identified or the season numbers cannot be confirmed,
the request stays visible as failed with its media record intact. Correct the
provider or metadata issue before retrying. For an unresolved TVDB identity or
season-numbering mismatch, choose **Map TV seasons** on the failed request to
repair it directly. Select the intended Sonarr series, then map every requested
TMDB season to one distinct season in the selected Sonarr order. The standard
order is verified against official TVDB data; alternate Sonarr v5 orders are
verified against the selected series. SeerrNG keeps the request's selected
Sonarr server, quality, requested seasons, and permissions when it retries. No
series or season mapping is selected automatically. Mappings are separate for
each Sonarr destination, quality, and season order, so repairing one request
does not change how another instance or order maps the same TVDB series.

An approved movie or TV request fails promptly with a service-unavailable
reason if its selected Radarr or Sonarr server was removed or is incompatible
with the request, or no default server is configured for its quality. Check the
matching service in **Settings > Services**, select or configure a usable
destination, then use **Retry**. A request whose explicit destination was
removed can also be reassigned by a request manager.

Request API responses include a stable `failureReason` code when a movie or TV
dispatch failure can be classified. The code distinguishes an unavailable
selected service, a dispatch failure, an unresolved TVDB identity, unverified
TVDB season data, and a season-numbering mismatch. The field contains no raw
provider error text. Retrying or resubmitting clears the previous code; a new
failure records the latest classification.

When a failed request has a recorded reason, its card and request-management
views show a plain-language explanation. If the selected TV listing uses
different regular-season numbers than TVDB, retry is disabled because the same
listing will fail the same check. Use **Find Another Listing** to search for a
series with matching season numbers, or **Map TV seasons** when the current
Sonarr series uses different numbers.

For books, the Books and Audiobooks filters keep ebook and audiobook requests
separate. A combined request can therefore be incomplete while one format is
available and the other is still requested or missing. See
[Books, Authors, and Series](./books-and-series.md) for book discovery and
series requests.

## Remove a copy from an acquisition service

Managers with request-management permission can use **Remove from Radarr**,
**Remove from Sonarr**, or the corresponding service action on a request when
SeerrNG has a linked provider copy. After confirmation, SeerrNG removes that
copy from the selected service and updates its matching availability state.
The SeerrNG media record, request, and status history remain, so removing a
copy does not erase who requested the title or its earlier progress. Other
qualities, book formats, and destinations keep their own availability state.

**Clear Data** is a separate, destructive SeerrNG action. Use it only when you
also intend to remove SeerrNG's media record and its associated requests and
history. It does not mean the same thing as removing a copy from an acquisition
service.

## Download an available copy

When an imported file is available to SeerrNG, its request card shows a
**Download copy** action. If the request has several files, open **Download
copies** and choose the episode, book format, comic issue, or magazine issue to
save. The browser handles transfer progress after the download starts; SeerrNG
keeps the request's availability and history on this page.

ROM and PC game requests also appear in Request Status with their provider
confirmed lifecycle states and download actions. See
[Software requests](./software-acquisition.md) for provider setup, emulation
system groups, and PC target selection.

Available notifications link directly to the matching request in Request
Status. Software requests are reconciled in the background, so completion can
be detected when the page is closed. SeerrNG checks request access and current
availability again before each download. It
does not expose provider credentials or server paths, and it only lists files
that the configured backend reports as imported and SeerrNG can access.

### Administrator setup

In **Settings > Main > Download Copies**, add a path mapping for file-based
backends. The backend's `remoteRoot` is the library root it reports; `localRoot`
is the corresponding absolute path mounted read-only inside SeerrNG. Use an
instance-specific `serviceId` when more than one backend of that type uses
different paths. For example:

```json
[
  {
    "serviceType": "radarr",
    "serviceId": 1,
    "remoteRoot": "/movies",
    "localRoot": "/mnt/media/movies"
  }
]
```

Mappings are supported for Radarr, Sonarr, Readarr-compatible ebook and
audiobook services, LazyLibrarian magazines, and Kapowarr comics. Mylar3 and
Issuarr comic issues are streamed through their authenticated API and do not
need a path mapping. Keep the mounted library read-only and map the narrowest practical
folder. If the backend does not report an imported file, the path is not
mounted, or a mapping cannot be resolved safely, the download action stays
hidden.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [Upstream Seerr issue #1994](https://github.com/seerr-team/seerr/issues/1994) — [@zwimer](https://github.com/zwimer).
- [Upstream Seerr issue #2070](https://github.com/seerr-team/seerr/issues/2070) — [@jstrot](https://github.com/jstrot).
- [Upstream Seerr PR #2698](https://github.com/seerr-team/seerr/pull/2698) — [@Xyerophyte](https://github.com/Xyerophyte).
- [Upstream Seerr PR #3184](https://github.com/seerr-team/seerr/pull/3184) — [@0xSysR3ll](https://github.com/0xSysR3ll).
- [Upstream Seerr PR #3279](https://github.com/seerr-team/seerr/pull/3279) — [@Knat-Dev](https://github.com/Knat-Dev).
- [Upstream Seerr PR #3288](https://github.com/seerr-team/seerr/pull/3288) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3351](https://github.com/seerr-team/seerr/pull/3351) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3376](https://github.com/seerr-team/seerr/pull/3376) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3377](https://github.com/seerr-team/seerr/pull/3377) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3378](https://github.com/seerr-team/seerr/pull/3378) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3379](https://github.com/seerr-team/seerr/pull/3379) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3380](https://github.com/seerr-team/seerr/pull/3380) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3385](https://github.com/seerr-team/seerr/pull/3385) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3412](https://github.com/seerr-team/seerr/pull/3412) — [@0xSysR3ll](https://github.com/0xSysR3ll).
- [Upstream Seerr issue #3460](https://github.com/seerr-team/seerr/issues/3460) — [@aussierk](https://github.com/aussierk).
- [Upstream Seerr PR #3461](https://github.com/seerr-team/seerr/pull/3461) — [@aussierk](https://github.com/aussierk).
- [Upstream Seerr PR #3462](https://github.com/seerr-team/seerr/pull/3462) — [@aussierk](https://github.com/aussierk).
- [Upstream Seerr issue #3488](https://github.com/seerr-team/seerr/issues/3488) — [@castiliad](https://github.com/castiliad).
- [Upstream Seerr PR #3489](https://github.com/seerr-team/seerr/pull/3489) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3490](https://github.com/seerr-team/seerr/pull/3490) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3493](https://github.com/seerr-team/seerr/pull/3493) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3494](https://github.com/seerr-team/seerr/pull/3494) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3495](https://github.com/seerr-team/seerr/pull/3495) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3496](https://github.com/seerr-team/seerr/pull/3496) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr issue #3508](https://github.com/seerr-team/seerr/issues/3508) — [@d-Rickyy-b](https://github.com/d-Rickyy-b).
- [Upstream Seerr issue #3542](https://github.com/seerr-team/seerr/issues/3542) — [@Kladki](https://github.com/Kladki).
- [Upstream Seerr PR #3578](https://github.com/seerr-team/seerr/pull/3578) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3579](https://github.com/seerr-team/seerr/pull/3579) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr issue #3604](https://github.com/seerr-team/seerr/issues/3604) — [@jrgutier](https://github.com/jrgutier).
- [Upstream Seerr PR #3605](https://github.com/seerr-team/seerr/pull/3605) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3606](https://github.com/seerr-team/seerr/pull/3606) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr issue #3642](https://github.com/seerr-team/seerr/issues/3642) — [@MrCasquette](https://github.com/MrCasquette).
- [Upstream Seerr PR #3647](https://github.com/seerr-team/seerr/pull/3647) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr issue #3657](https://github.com/seerr-team/seerr/issues/3657) — [@Octoputty](https://github.com/Octoputty).
- [Upstream Seerr PR #3659](https://github.com/seerr-team/seerr/pull/3659) — [@fallenbagel](https://github.com/fallenbagel).

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
