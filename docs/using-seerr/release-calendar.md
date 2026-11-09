# Release Calendar

Open **Release Calendar** from navigation to browse release information across
the enabled media categories. Choose a date range and the available media/status
filters. Calendar visibility follows your account's enabled categories and request
permissions; it is not a public listing of everybody's requests.

The calendar aggregates supported configured sources, including video and
software release information. A partial-source notice means that one source could
not supply a complete result. An empty or partial calendar does not prove there
are no releases. Retry after restoring the provider connection; administrators
can investigate source details that are withheld from ordinary viewers.

Dates come from provider metadata and may change. A date is not a promise of
acquisition, import completion or local availability. Open the title or
[Request Status](./request-status.md) to check the request and its destination.

Implementation: [calendar page](https://github.com/snapetech-org/seerrng/blob/main/src/pages/calendar.tsx),
[permission-aware API](https://github.com/snapetech-org/seerrng/blob/main/server/routes/calendar.ts) and
[release aggregation](https://github.com/snapetech-org/seerrng/blob/main/server/lib/releaseCalendar/index.ts).

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
