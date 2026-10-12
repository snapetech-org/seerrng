---
category: security
audience: operators
area: validation-engine
action: Stop and disable existing Mode 3 services before upgrading.
breaking: true
---

Mode 3 enrollment and distributed service commands now stay disabled until the protocol authenticates and encrypts each node with its own credentials. Stop older services before upgrading so their previous binaries cannot continue accepting enrollment.
