### Fixed

- **Lumen:** The standalone image now builds with the shared SeerrNG locale, asset, and utility sources it needs. Its Dockerfile, release workflow, Compose examples, and local build instructions use the repository root as build context. Lumen's implemented Discover, account, profile, and settings routes are no longer sent to the full SeerrNG companion by a generic legacy redirect.
