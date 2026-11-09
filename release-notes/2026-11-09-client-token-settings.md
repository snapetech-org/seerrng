# Manage scoped client tokens from your profile

Profile → Settings → Client Tokens now creates expiring, per-account tokens
for browser extensions and other clients. Choose discovery/request access,
copy a token once, and revoke individual clients without changing another
client's credentials. Password changes continue to invalidate existing tokens.
Server settings and user administration remain outside these scopes.

Automated regression coverage now exercises PostgreSQL token migration and
authentication, account token controls in all three interface themes, narrator
management permissions, and Android/iOS current-origin rendering with
rendered origin-bar evidence.

The iOS browser also stops publishing unchanged state while SwiftUI is rendering.
This prevents a feedback loop when opening a server and ignores late state
callbacks from a previously selected server.
