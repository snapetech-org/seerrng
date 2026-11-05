---
category: fixed
audience: users, operators
area: integrations
breaking: false
action: none
---

qBittorrent 5.2 connections accept successful empty login responses and use the port-specific session cookie, while retaining support for older clients and subnet authentication bypass. Audiobookshelf connection tests now send edited ports as numbers. Seerr-to-SeerrNG migrations accept a freshly initialized SQLite target containing its internal startup lock, and the migration command is included in the Docker image.
