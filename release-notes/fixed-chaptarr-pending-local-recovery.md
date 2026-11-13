---
category: fixed
audience: users, operators
area: bookshelf
action: none
breaking: false
---
Pending Chaptarr book requests can reconnect to an existing monitored book when an older Goodreads identity no longer resolves through the current metadata provider. Recovery checks the saved title, author, work identity, format, and edition selection against local records without fetching the author's catalog or creating another book. Ambiguous matches and active author imports or search commands remain untouched.
