---
category: fixed
audience: users
area: books
action: none
breaking: false
---
Audiobookshelf availability scans now serialize book-record writes so SQLite does not start overlapping transactions when a library contains multiple ISBN-matched audiobooks.
