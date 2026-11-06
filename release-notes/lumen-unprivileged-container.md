---
category: security
audience: operators
area: lumen
action: none
breaking: false
---
Lumen's production nginx container now runs as an unprivileged user, with its static application read-only. Container tests verify the built image, forwarding trust and companion session checks with all Linux capabilities dropped and no new privileges. Existing port mappings remain compatible.
