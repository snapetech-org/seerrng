---
category: fixed
audience: users, operators
area: request-status
action: none
breaking: false
---
Approved movie and TV requests now retry temporary Radarr and Sonarr network or server failures with durable exponential backoff. If a provider accepted a request before its response was lost, SeerrNG reuses the matching TMDB or TVDB item. Invalid settings remain visible; after 50 failed attempts, the request moves to Failed for manual recovery.
