---
category: security
audience: users
area: dependencies
action: upgrade
breaking: false
---
The app and documentation builds locally patch Picomatch to treat repeated extglobs containing wildcard stars as literal text, mitigating [CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) while an upstream release is pending.
