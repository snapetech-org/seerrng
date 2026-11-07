---
category: fixed
audience: users, operators
area: books
action: Rescan enabled book services after upgrading to refresh imported-file availability.
breaking: false
---
Book availability now follows confirmed ebook and audiobook files per destination. Pending manager records no longer complete the other format, hide missing-format requests, or appear available. Migration leaves unverified records for rescanning while preserving independently scanned Plex and Audiobookshelf items.

Ordinary users retain an audiobook file-evidence flag when private Plex item
keys are removed from responses. The flag does not expose the item key or
replace the current availability status.
