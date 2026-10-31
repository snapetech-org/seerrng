---
category: changed
audience: operators
area: api
action: none
breaking: false
---

The OpenAPI watchlist request now documents the type-specific identifier required for each supported media type and keeps `mediaType` required, matching server-side validation. Seerr [issue #3298](https://github.com/seerr-team/seerr/issues/3298) reported the mismatch; [PR #3425](https://github.com/seerr-team/seerr/pull/3425) corrected the movie and TV request schema upstream.
