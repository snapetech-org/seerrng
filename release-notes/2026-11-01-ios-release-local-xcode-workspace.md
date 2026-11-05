---
category: fixed
audience: operators
area: release-pipeline
action: none
breaking: false
---

Xcode release builds for iOS now keep temporary files and test results on local APFS storage. Finished archives and checksums are copied to the Actions workspace after Xcode exits, preventing NFS metadata failures; failed simulator runs retain result bundles for diagnostics.
