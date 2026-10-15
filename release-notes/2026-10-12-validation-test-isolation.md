---
category: security
audience: operators
area: validation
action: none
breaking: false
---

Local test-only validation excludes nested environment files and common credentials from disposable workspaces, isolates test code from host services and external networks, and keeps dependencies read-only. A trusted outer launcher can isolate unreviewed candidates before their validation code runs. Main image publication and deployment wait for hosted validation and image scans.
