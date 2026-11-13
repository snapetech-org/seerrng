---
category: fixed
audience: operators
area: books
action: Grant the restricted ChaptarrNG service key access to `/api/v1/library/search`.
breaking: false
---
When provider metadata lookup returns no addable result, SeerrNG can fall back to ChaptarrNG's local catalog search. If ChaptarrNG denies that request, SeerrNG now logs an actionable warning identifying the required `/api/v1/library/search` permission for its restricted service key. Verify that ChaptarrNG is updated and SeerrNG is configured with the restricted key.
