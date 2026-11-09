---
category: fixed
audience: operators
area: deployment
action: none
breaking: false
---

Release signature verification now checks out its verified Cosign installer correctly. Completed, signed release assets can be recovered after a verifier failure while retaining the immutable tag and image; publication still requires fresh signature and attestation verification.
