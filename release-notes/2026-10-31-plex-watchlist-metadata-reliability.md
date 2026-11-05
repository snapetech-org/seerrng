---
category: fixed
audience: users
area: watchlist
action: none
breaking: false
---

Plex Watchlist pages now load item metadata with bounded concurrency. A timed-out
or unreachable item is skipped for the current sync while the remaining items
continue loading; authentication and other provider errors still surface as a
failed retrieval. This adapts Seerr [issue #3235](https://github.com/seerr-team/seerr/issues/3235)
and [PR #3251](https://github.com/seerr-team/seerr/pull/3251).
