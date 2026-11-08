---
category: fixed
audience: operators
area: releases
action: none
breaking: false
---

Android packaging and image signing tolerate failures of the primary tool
download endpoint by using checksum-verified official GitHub release assets.
Gradle, Cosign and Trivy versions are retained, along with wrapper checksums,
publisher verification, vulnerability scans and release signing requirements.
