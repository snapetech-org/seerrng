category: fixed
audience: users, operators
area: requests
action: none
breaking: false
---
Lumen now verifies ReadMeABook approval and denial changes against the pending queue. If the queue read is stale, Check Status retries confirmation without submitting the decision a second time.
