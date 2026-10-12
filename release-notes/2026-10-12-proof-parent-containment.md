---
category: security
audience: operators
area: validation-engine
action: Use hosted Mode 2 validation until the local proof-parent isolation boundary is replaced.
breaking: true
---

The validation helper now refuses unsafe execution that shares privileged control sockets with repository tests. Network-lease logs retain only token digests. Use hosted Mode 2 for complete validation while this local helper is blocked.
