# Playback mutation authority

The historical contribution review reproduced playlist writes after account
permission revocation, Plex unlinking and password credential-version changes
inside an awaited provider catalog read. Both the single-media and collection
playlist routes returned 200 and wrote using their earlier account snapshot.
All six baseline regression cases failed; three existing selection cases passed.

Playback now admits external mutations through the existing per-user security
mutation coordinator. A fresh actor must retain the requested media/quality
permissions, the same native credential pair and the same account credential
version. The coordinator also checks the original request's session or API-key
authority; the route snapshot does not replace that context. Catalog and device
reads happen outside the lock. Playlist replacement, and each Plex queue plus
Companion command pair, hold the security lease for their external mutations.
Jellyfin and Emby session commands use the same boundary. Authorization changes
return 403, rather than being reported as a provider failure.

Validation uses real isolated SQLite user/media rows and controlled provider
responses, with no live Plex, Jellyfin or Emby account. The original six catalog
races now reject without playlist writes. Device lookup tests exercise Plex,
Jellyfin and Emby, single-media and collection actions, unchanged authority and
permission, unlink and credential-version changes. Stale session and revoked
API-key contexts are checked independently of the route snapshot. Existing
selection/quality and shared security-helper checks remain enabled.

This does not cancel an external command already admitted before revocation;
security changes serialize after that admitted mutation completes. It does not
claim physical receiver or live-provider acceptance.
