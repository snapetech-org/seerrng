# Offline browsing and caching

SeerrNG uses several caches with different purposes. None makes an unavailable
acquisition provider usable or proves a file is owned or playable.

| Cache | Behavior and controls |
| --- | --- |
| Browser runtime cache | Eligible API/static/image responses can be reused; account data is partitioned and authentication boundaries discard the previous account's in-memory state |
| Public metadata cache | Selected provider metadata can survive restart and serve bounded stale results during a slow or transient refresh; terminal authentication, permission and missing-record errors remain errors |
| Image cache | Proxies supported artwork, uses validators and batches warming requests through a shared bounded queue |
| Provider/service caches | Reduce repeated calls; private availability and acquisition-service state are not covered by public metadata persistence |

## Recover a page

When an eligible page was previously loaded, some content may remain visible
while a refresh fails. Use **Retry** on an error message after connectivity
returns. If navigation reaches the offline utility page, its Retry action and
reconnection handler return to the intended in-app route. Its same-origin script
is cached together with the utility document so recovery works under the
Content Security Policy. A first visit without a connection may have no cached
content. New searches, requests, logins and provider writes require connectivity.

Sign out before another household member uses a shared browser. Cached status
is not playback entitlement; media-server account access is checked separately.
Movie/TV detail recovery preserves explicit access-denied/not-found states and
does not report failed watchlist writes as successful changes.

## Operate the caches

See **Settings → Jobs & Cache** for statistics and available flush controls,
and **Settings → General** for image caching. Flush the relevant cache when
diagnosing stale metadata, then retry the underlying provider. Do not clear the
application's database or replace API keys to fix a stale poster.

Implementation: [service worker](https://github.com/snapetech-org/seerrng/blob/main/public/sw.js),
[offline recovery](https://github.com/snapetech-org/seerrng/blob/main/public/offline-recovery.js),
[metadata cache](https://github.com/snapetech-org/seerrng/blob/main/server/lib/cache.ts) and
[image warm queue](https://github.com/snapetech-org/seerrng/blob/main/src/utils/imageWarmQueue.ts).

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [Upstream Seerr issue #3183](https://github.com/seerr-team/seerr/issues/3183) — [@Erwan-loot](https://github.com/Erwan-loot).
- [Upstream Seerr issue #3204](https://github.com/seerr-team/seerr/issues/3204) — [@bryceeppler](https://github.com/bryceeppler).
- [Upstream Seerr PR #3206](https://github.com/seerr-team/seerr/pull/3206) — [@Clancey](https://github.com/Clancey).
- [Upstream Seerr issue #3515](https://github.com/seerr-team/seerr/issues/3515) — [@seeARMS](https://github.com/seeARMS).
- [Upstream Seerr issue #3665](https://github.com/seerr-team/seerr/issues/3665) — [@wstock](https://github.com/wstock).
- [provider-cache contribution #634](https://github.com/snapetech-org/seerrng/pull/634) — [@ncbudd](https://github.com/ncbudd).

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
