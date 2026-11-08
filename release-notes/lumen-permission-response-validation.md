---
category: security
audience: users, operators
area: lumen
action: none
breaking: false
---

Lumen now requires a valid nonnegative integer permission mask before shared settings or branding writes. Malformed upstream strings, arrays, fractions and negative masks are denied instead of being coerced; ordinary SeerrNG administrator responses continue to work.
