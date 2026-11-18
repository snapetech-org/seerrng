---
category: security
audience: operators
area: release
action: none
breaking: false
---
Main and release image publishing no longer share GitHub Actions BuildKit caches, and their Trivy scans fetch fresh vulnerability databases.

Preview publishing and the standalone Trivy scanner also avoid these shared caches.

Trusted Docker jobs also disable the setup actions' Buildx binary and QEMU image caches.
