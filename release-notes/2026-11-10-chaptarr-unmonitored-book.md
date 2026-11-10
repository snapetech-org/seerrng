---
category: fixed
audience: users, operators
area: books
action: none
breaking: false
---

Book requests now reuse an exact, unmonitored ChaptarrNG catalog row when the provider lookup omits its local ID. SeerrNG uses ChaptarrNG's format-scoped provider-ID lookup and updates that row instead of attempting to add a duplicate book.
