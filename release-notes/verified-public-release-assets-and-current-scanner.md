---
category: fixed
audience: operators
area: releases
action: none
breaking: false
---

Public tool downloads recover when a repository-scoped token cannot read another
project's release asset, while retaining the pinned checksum and credential-free
redirects. Lumen validates the current scanner against reviewed native amd64 and
arm64 pins and refuses an unreviewed version instead of silently using an older
scanner.
