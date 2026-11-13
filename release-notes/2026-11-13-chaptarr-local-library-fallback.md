---
category: fixed
audience: users, operators
area: books
action: none
breaking: false
---

When ChaptarrNG's remote metadata source is unavailable, SeerrNG now checks Chaptarr's indexed local catalog before remote book searches. It only reuses a matching title and format, confirms the author and Open Library identity when available, and verifies a selected ISBN or edition before monitoring. The fallback uses bounded indexed and per-book requests; it does not download the full library.
