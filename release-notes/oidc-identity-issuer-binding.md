---
category: fixed
audience: users, operators
area: authentication
action: none
breaking: true
---

OIDC linked accounts are now keyed by the authenticated issuer and subject,
not only the provider slug and subject. Existing links do not have a recorded
issuer and are intentionally left unbound by the database migration. Before
upgrading, make sure OIDC-only users have another working recovery method; they
must sign in through that method and explicitly link the provider again after
the upgrade.

OIDC sign-in now requires the provider to assert `email_verified=true` for both
new and previously linked identities.
