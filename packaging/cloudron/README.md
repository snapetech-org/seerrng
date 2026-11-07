# Cloudron Community Package Candidate

This adapter builds from the published v3.72.20 image pinned by digest. It is a
local package candidate, not an advertised marketplace release. No published
`CloudronVersions.json` is provided until a built package has actually passed
installation, update and backup/restore verification on Cloudron.

```sh
cd packaging/cloudron
docker build -t seerrng-cloudron:0.1.0 .
```

On a Cloudron 10 or newer test server, use `cloudron install` from this directory.
The CLI builds and installs the source. Use `cloudron update` for the update
cycle. Registry-based installation and community publication follow the
[official tutorial](https://docs.cloudron.io/packaging/tutorial/).

The localstorage addon owns `/app/data`; it contains configuration and the
SQLite database. The manifest declares the SQLite file for consistent backups.
The short startup initializer restores ownership without following stored
symlinks, then drops to UID/GID 1000 before loading SeerrNG. The root filesystem
stays read-only; Next's cache uses `/tmp`. Cloudron terminates browser TLS and
proxies to HTTP port 5055. Its HTTPS `CLOUDRON_APP_ORIGIN` configures the
native application URL and single-hop proxy support at startup. The backend
port must remain reachable only through the managed proxy.

This candidate uses SQLite. External PostgreSQL backup integration is not
configured by this manifest. Platform installation, update, permissions after
restore, login, and an actual backup/restore cycle remain required before
community publication. Local container qualification is recorded separately.

References: [localstorage](https://docs.cloudron.io/packaging/addons/#localstorage),
[manifest](https://docs.cloudron.io/packaging/manifest/).
