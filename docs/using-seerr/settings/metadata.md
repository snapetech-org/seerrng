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
