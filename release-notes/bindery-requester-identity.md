---
category: security
audience: users
area: books
action: Configure Requester Account Mappings in Bindery service settings when the backend supports requester-owned requests.
breaking: true
---
Bindery requester-owned requests now require administrator-configured account ID mappings. Changing a display name or email cannot assign requests to another Bindery account. Missing or stale mappings stop dispatch; older backends without requester ownership keep their service-account behavior.
