---
category: fixed
audience: users, operators
area: jellyfin
action: none
breaking: false
---

Jellyfin library synchronization now retains the matched library's stored scan
timestamp as well as its enabled selection when its display name changes but
the Jellyfin server ID remains the same. The timestamp is preserved as
metadata; Jellyfin scan scheduling and completion behavior are unchanged.

This adapts Seerr [PR #3323](https://github.com/seerr-team/seerr/pull/3323).
