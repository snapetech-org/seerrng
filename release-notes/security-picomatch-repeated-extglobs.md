---
category: security
audience: users
area: dependencies
action: upgrade
breaking: false
---
The app and documentation builds locally patch Picomatch to treat repeated extglobs containing wildcard stars as literal text. GitHub withdrew the [advisory associated with this change](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) on November 18.
