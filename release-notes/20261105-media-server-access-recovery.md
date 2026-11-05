Recover viewer-scoped Plex/Jellyfin/Emby availability and destination-aware request
completion. Require corroborating title identity, isolate cached checks by viewer
credentials and title, and handle unavailable TV season relations safely.

Add Jellyfin Quick Connect-only sign-in with password and plugin-bridge API
enforcement, preserving local sign-in and existing connection settings. Preserve
the policy across temporary sign-in disablement and migrate its earlier setting
name. Require affirmative administrator proof during initial Jellyfin setup.

Bound Plex watchlist metadata hydration, retain successful items after individual
transport timeouts, and update watchlist API and self-hosted Plex Web guidance.
