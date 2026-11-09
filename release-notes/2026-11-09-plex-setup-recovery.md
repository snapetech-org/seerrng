---
category: fixed
audience: users
area: plex-setup
action: none
breaking: false
---

Plex setup avoids repeated library-validation requests and pauses same-origin API traffic after HTTP 429 responses, honoring Retry-After before allowing retries. Failed reads retain library choices and offer a read-only retry.

Server discovery presents one choice per server, recommends a reachable local-network connection, and keeps alternative addresses and readable failure reasons under Other Connections (Advanced). Library updates apply the server-confirmed selection before accepting another change.
