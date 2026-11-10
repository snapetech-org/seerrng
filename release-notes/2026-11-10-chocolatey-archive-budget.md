---
category: changed
audience: operators
area: release-pipeline
action: none
breaking: false
---

Windows release archives now avoid duplicate dependencies and omit unneeded source maps and test screenshots while retaining runtime files. ZIPs must fit a 190,000,000-byte budget before publication, and Chocolatey verifies the downloaded archive before submission.
