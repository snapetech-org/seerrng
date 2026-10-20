---
category: changed
audience: operators
area: containers
action: none
breaking: false
---
After a stable SeerrNG release is published, `:stable`, `:latest`, `:main`, and `:master` now point to its verified multi-architecture image digest in GHCR and Docker Hub. The release gate checks those channel aliases and the release's moving version tags for digest drift.
