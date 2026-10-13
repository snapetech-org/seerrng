---
category: fixed
audience: users, operators
area: database
action: none
breaking: false
---

SQLite upgrades now tolerate a missing push-subscription index, preventing startup from failing when that index was never created.
