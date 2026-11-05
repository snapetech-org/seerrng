---
title: Preserve Jellyfin library settings across renames
description: Jellyfin library synchronization keeps enabled state and stored scan timestamps when a library retains its server ID after a rename.
date: 2026-10-31
---

Jellyfin library synchronization now retains the matched library's stored scan
timestamp as well as its enabled selection when its display name changes but
the Jellyfin server ID remains the same. The timestamp is preserved as
metadata; Jellyfin scan scheduling and completion behavior are unchanged.

This adapts Seerr [PR #3323](https://github.com/seerr-team/seerr/pull/3323).
