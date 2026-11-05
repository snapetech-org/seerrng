---
category: added
audience: users, operators
area: notifications
action: none
breaking: false
---

Administrators can enable a separate **Pending Request Updated** notification.
SeerrNG queues it when an edit changes a pending request's owner, selected
seasons or episodes, or saved acquisition options. Webhook templates expose the
`MEDIA_PENDING_UPDATED` event, and the event is supported by ntfy and the other
configured notification agents.
