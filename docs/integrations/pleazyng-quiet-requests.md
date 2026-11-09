# Quiet title requests for Pleazyng

The authenticated `GET /api/v1/request/intent/capabilities` describes the viewer's movie/TV and 4K request permissions, partial-season support, notification support and batch limit. `POST /api/v1/request/intent/state` accepts 1–40 `{mediaType: "movie" | "tv", tmdbId}` identities and returns only typed title status, anonymized other-viewer claims, own claims, per-season coverage, subscription scope and per-viewer eligibility. The projection does not return requester identities, service credentials, file paths or request routing. Missing titles are represented as unknown state. Both endpoints require a live authenticated session; the client API-key allowlist includes the appropriate discover/request scopes.

`POST /api/v1/request` accepts an optional `Idempotency-Key` of 16–128 URL-safe ASCII characters for a self-requested movie or show. The server hashes the key with the authenticated user ID, stores a body fingerprint with the created request and serializes same-user admission. Replaying the same key and sanitized payload returns the existing request; reuse for a different payload is rejected. Old clients without the header retain existing behavior. The SQLite and PostgreSQL migrations add private nullable columns and a unique index. Neither hash is selected into ordinary API responses.

The existing `/:id/availability-subscriptions/:mediaType/:tmdbId` routes accept optional `is4k` and TV `seasonNumber` scope. A subscription can be made only if another viewer has an active request covering that exact scope and the scope is not already available. Omitted scope preserves legacy title-wide semantics. A viewer may retarget one existing subscription for that title. When acquisition completes, the request subscriber enqueues only matching scopes and consumes only fulfilled subscriptions; the notification outbox rechecks scoped availability at delivery time. Delivery still follows the user's configured notification channels. No new notifications destination is needed.

The client remains responsible for deciding whether a media-server copy is accessible and playable by its active profile. These endpoints describe SeerrNG request and acquisition state, not a playback entitlement.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
