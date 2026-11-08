---
category: fixed
audience: users
area: lumen
action: none
breaking: false
---

Lumen shares simultaneous API reads, briefly reuses frequently checked answers and bounds its saved cache. Responses started before a request change or sign-in reset cannot overwrite newer cached availability. The optional companion container also supports a custom unprivileged `user:` without changing static application permissions.
