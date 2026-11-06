# Co-op Cloud recipe draft

This directory contains a local Co-op Cloud recipe draft for SeerrNG.
It pins the published v3.72.16 public image by digest, Traefik for the web UI, and a named
volume for `/app/config`.

The recipe is not yet in the canonical `coop-cloud/apps` collection. Submit a
wishlist issue first, then copy this directory into the recipe repository after
the maintainers accept the app. The usual deployment flow is:

```sh
abra app new seerrng
abra app config seerrng.example.com
abra app deploy seerrng.example.com
```

The external `proxy` network and a reachable Docker Swarm host are required.

Local Compose validation does not qualify Docker Swarm, Traefik routing or
marketplace inclusion. Verify those on a test Swarm before publishing a recipe.

The mounted startup adapter requires UID/GID 1000 and a canonical HTTPS
`SEERR_PUBLIC_ORIGIN`, then configures SeerrNG's native application URL and
single-hop proxy support before starting the server. Traefik must replace
caller-supplied forwarding headers, and the backend must be reachable only
through that trusted proxy. Keep one replica when using the bundled SQLite
volume; multiple replicas must not share this SQLite database.
