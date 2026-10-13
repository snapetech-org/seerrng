---
category: security
audience: operators
area: ci-security
action: none
breaking: false
---

Pull-request validation now uses GitHub-hosted runners for every author. Persistent local runners are reserved for main-branch validation, reducing exposure of local services and files to proposed changes.
