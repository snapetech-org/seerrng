---
category: fixed
audience: users, operators
area: requests
action: none
breaking: false
---
TV requests retry only missing season metadata once after a partial provider response or temporary request failure. Large series keep loading later seasons, and the existing request selection stays intact while metadata recovers.
