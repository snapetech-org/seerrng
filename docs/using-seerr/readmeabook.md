# ReadMeABook audiobooks

Administrators can configure **ReadMeABook Audiobooks** in service settings.
Enable the integration, enter its host, port, HTTPS choice, URL base and API
token, then use **Test connection** and save. An existing saved token is retained
when its field is left empty; use the explicit removal control to clear it.

The audiobook discovery view offers ReadMeABook search and request actions when
the service and audiobook category are enabled. Requests follow account
permissions and approval policy. Administrators can review requests awaiting
approval, approve or deny them, and inspect the acquisition dashboard. Status
comes from the backend, so connectivity failures should be investigated before
retrying a request.

ReadMeABook is an acquisition destination. It is separate from read-only
[Audiobookshelf availability](./bookshelf-backend.md) and from
[reader apps](./reader-delivery.md). It cannot verify edition languages under
SeerrNG's [book-language admission policy](./book-language-policy.md), so requests
to it are blocked while that policy is active. Use a destination capable of
verifying the requested edition when language restrictions are required.

Implementation: [service settings](https://github.com/snapetech-org/seerrng/blob/main/src/components/Settings/SettingsReadMeABook.tsx),
[search interface](https://github.com/snapetech-org/seerrng/blob/main/src/components/Discover/DiscoverBooks/ReadMeABookSearch.tsx)
and [request routes](https://github.com/snapetech-org/seerrng/blob/main/server/routes/readmeabook.ts).

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
