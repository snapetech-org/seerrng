---
category: fixed
audience: operators
area: database
action: none
breaking: false
---
SQLite permissions are secured before opening the database. Startup no longer reopens and closes active database files, preserving the locks that let backup tools and other database connections safely read current committed data. New database and journal files retain private permissions.
