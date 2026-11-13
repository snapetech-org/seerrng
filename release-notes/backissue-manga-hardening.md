---
category: fixed
audience: users, operators
area: comics
action: none
breaking: false
---

Harden BackIssue collection sync so only an explicitly unsupported libraries endpoint triggers the legacy unfiltered scan. Validate BackIssue's collection and queue during the read-only connection test, preserve verified AniList manga identity with comic requests across restarts, and document least-privilege BackIssue account setup.
