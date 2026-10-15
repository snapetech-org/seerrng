---
category: changed
audience: operators
area: release-pipeline
action: none
breaking: false
---

SeerrNG validation now isolates workflow-attempt scratch and runs independent Node test files concurrently within the admitted worker budget while keeping each file process-isolated and preserving test result accounting. Superseded pull-request runs now release their concurrency slot after cancellation while current-run failures still reconcile.
