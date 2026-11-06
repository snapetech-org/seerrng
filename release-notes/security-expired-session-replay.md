---
category: security
audience: users, operators
area: authentication
action: update SeerrNG to enforce session expiry during authentication and renewal
breaking: false
---
Expired server sessions are rejected during lookup and cannot be revived by a later session touch. Unexpired sessions continue to renew normally. Regression coverage includes the exact expiry boundary, native signed-cookie replay, deleted sessions and reopening persistent storage.
