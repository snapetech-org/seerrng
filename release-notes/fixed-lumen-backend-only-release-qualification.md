---
category: fixed
audience: operators
area: deployment
action: none
breaking: false
---

Lumen validation now runs for every main commit so backend-only releases can publish their matching companion automatically. The publisher waits briefly for exact-source validation and continues to block unqualified tags.
