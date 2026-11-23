### Fixed

- **Lumen:** The standalone image now builds with the shared SeerrNG locale, asset, and utility sources it needs. Its Dockerfile, release workflow, Compose examples, and local build instructions use the repository root as build context. Lumen's implemented Discover, account, profile, and settings routes are no longer sent to the full SeerrNG companion by a generic legacy redirect.
- **Lumen:** Administration search now finds default user permission and category controls in French and Arabic, and the default permissions shortcut opens its current Requests settings location. The Requests page uses the same “Over Quota” label in its list and history.
