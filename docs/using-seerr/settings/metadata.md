---
sidebar_position: 3.5
---

# Metadata settings

Administrators can choose the metadata providers for series and anime and check
provider connectivity under **Settings → Metadata**. Provider tests make a
read-only request to the selected service.

## Music metadata providers

SeerrNG uses MusicBrainz for music metadata and Cover Art Archive for album
artwork. The **Music Metadata Providers** section shows the result of the most
recent connection test on the page and lets administrators adjust Cover Art
Archive request limits. Results start at **Not Tested** and are not stored as
health history.

The defaults keep up to **5 requests in flight** and allow up to **50 requests
per second**. Each setting can be reduced independently. Supported values are
1–5 concurrent requests and 1–50 requests per second. The limits apply across
the SeerrNG process, including each validated redirect made while fetching
Cover Art Archive metadata. Music artwork batches retain their existing
five-item concurrency ceiling.

Use **Test** to check both music providers. The probes use read-only requests
and bypass cached responses so a stale cache cannot make an unavailable
provider appear operational.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [Upstream Seerr PR #3110](https://github.com/seerr-team/seerr/pull/3110) — [@Crow-Control](https://github.com/Crow-Control).
- [Upstream Seerr PR #3116](https://github.com/seerr-team/seerr/pull/3116) — [@Crow-Control](https://github.com/Crow-Control).

[Back to the Seerr / SeerrNG feature comparison](../../feature-comparison.md).
