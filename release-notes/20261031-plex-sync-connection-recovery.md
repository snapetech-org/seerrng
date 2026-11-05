---
category: fixed
audience: users, operators
area: plex
action: none
breaking: false
---

When Plex is unreachable during library synchronization, SeerrNG now reports a connection error and retains the saved library list. A failed startup migration leaves existing settings intact and retries on the next restart. This adapts Seerr [PR #3324](https://github.com/seerr-team/seerr/pull/3324).
