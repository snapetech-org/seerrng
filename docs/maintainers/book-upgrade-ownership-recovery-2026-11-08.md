# Book upgrade ownership recovery — issue606

The v3.72.5 database can contain one catalog media record per Bookshelf server,
with a completed request on a stale row and inventory evidence on a second ISBN
row. Scans previously preferred that ISBN row. Provider-qualified scan identities
also missed legacy bare catalog identities, leaving single-row titles stale.

A scan now prefers the exact current-service catalog identity. The negotiated
v1 Bookshelf-family provider dialect supplies bounded aliases within that service;
unknown contracts and cross-provider prefixes receive no numeric aliases. Bare
Readarr IDs cannot claim records targeted at another service. Physical file
observations are copied only to matched rows scoped to, targeted at, or already
holding evidence from this service. No media rows or requests are moved/deleted;
other-format evidence and Audiobookshelf links remain intact. An optional edition
metadata failure preserves inventory file evidence and prevents cleanup from
assuming the scan was complete.

After installing the fixed build, run **Bookshelf Scan** under Settings -> Jobs.
No clear-data operation or request-history deletion is required.

Validation: six regression cases fail before the repair. Sixteen focused native
cases pass afterward, including both formats, single and split records, evidence
removal, existing catalog retention, provider boundaries and metadata outages.
Production compilation passes. An isolated SQLite fixture with the reported
ChaptarrNG0.9.977 capability contract is scanned by the compiled production
worker: Library goes from zero ebook/audio results to one ebook and two audio
results, with all five media rows and three completed request links unchanged.
Actual Orig/John book details at390/1440 show Available and Synthetic Narrator,
and disable the owned audiobook request action. No real household files or
provider writes are used; the read-only HTTP provider is an explicit fixture.

Evidence: task deliverables seerrng-human-workflow-audit-20261107/issue606-*.
Release and final-head CI status must be recorded separately; this document does
not claim the fix is present in v3.72.23.
