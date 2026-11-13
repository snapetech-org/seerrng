# Chaptarr local library search authorization diagnostics

When provider metadata lookup returns no addable result, SeerrNG can fall back to ChaptarrNG's local catalog search. If ChaptarrNG denies that request, SeerrNG now logs an actionable warning identifying the required `/api/v1/library/search` permission for its restricted service key. Verify that ChaptarrNG is updated and SeerrNG is configured with the restricted key.
