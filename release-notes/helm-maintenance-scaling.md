---
category: added
audience: operators
area: kubernetes
action: none
breaking: false
---

The Helm chart can now run with zero replicas during storage maintenance or backups and resume with one replica afterward. The configuration claim is retained, and values above one are rejected because SeerrNG is a single-instance application.
