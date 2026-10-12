---
category: security
audience: operators
area: validation
action: none
breaking: false
---

Local test-only validation copies candidate files into a disposable workspace and excludes nested `.env` files and common credential/config paths. It isolates test code from the host home, temporary files, service sockets, and external network; it rejects dependency roots outside the candidate and mounts installed dependencies read-only. Main image publication and deployment wait for successful hosted validation reconciliation and image scans.
