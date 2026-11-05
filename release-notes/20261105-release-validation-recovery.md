---
category: fixed
audience: operators
area: release-pipeline
action: none
breaking: false
---

Owner PR validation now includes release-note and Helm checks at the selected
commit. CI starts once when its action label is added. iOS builds detect APFS
using Darwin filesystem information and retain local diagnostics if copying them
fails. Unpublished release fragments now follow the release metadata contract.
