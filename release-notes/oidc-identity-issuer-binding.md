---
category: fixed
audience: users, operators
area: authentication
action: Verify provider verified-email claims, provide another sign-in method, and relink affected OIDC accounts after upgrading.
breaking: true
---

OIDC identities now bind to provider issuer and subject. Existing links have no issuer and remain unbound after upgrade; OIDC sign-in also requires the provider to assert `email_verified=true`.
