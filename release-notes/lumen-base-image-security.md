---
category: security
audience: operators
area: lumen
action: Rebuild and recreate the Lumen container to receive the updated base packages.
breaking: false
---
Lumen uses an updated digest of its nginx base image to replace vulnerable Brotli, curl and Expat packages. Rebuild Lumen to receive the updated image. CI now scans the same production image used by the proxy tests and rejects fixable HIGH or CRITICAL vulnerabilities.
