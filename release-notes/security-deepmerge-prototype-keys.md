---
category: security
audience: users, operators
area: dependencies
action: none
breaking: false
---
SeerrNG now blocks unsafe `__proto__` keys while cloning and merging objects through its pinned `deepmerge` dependency, including the documentation build dependency tree.
