---
category: security
audience: maintainers
area: release
action: none
breaking: false
---
Main and release image publishing no longer share GitHub Actions BuildKit caches, and their Trivy scans fetch fresh vulnerability databases.
