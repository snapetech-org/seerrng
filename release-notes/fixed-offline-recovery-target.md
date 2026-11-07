---
category: fixed
audience: users
area: offline
action: none
breaking: false
---

Opening the offline recovery page directly now returns home when the server is reachable instead of repeatedly reloading the utility page. Recovery from a service-worker fallback still returns to the originally requested page. Manual reload and connectivity recovery use the same destination.
