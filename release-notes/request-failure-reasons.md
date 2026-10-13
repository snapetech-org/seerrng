---
category: added
audience: users, operators
area: requests
action: none
breaking: false
---

Request API responses now retain a stable, non-sensitive reason for classified movie and TV dispatch failures. Retrying or resubmitting clears the old reason, and a new failure replaces it without storing provider error text.
