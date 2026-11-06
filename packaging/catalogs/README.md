# Self-hosting Catalog Deployment

The Compose contract pins the public, published v3.72.16 multi-architecture
image by digest. It needs no registry login and supports Linux amd64 and arm64.
Future pin updates must use a published image and repeat runtime verification.

```sh
docker compose -f packaging/catalogs/compose.yaml config
docker compose -f packaging/catalogs/compose.yaml up -d
```

The web UI binds to `127.0.0.1:5055` by default for a host reverse proxy. Set
`SEERRNG_BIND_ADDRESS` and `SEERRNG_HTTP_PORT` to change that mapping. Configure
TLS before remote browser authentication. Persist the named `/app/config`
volume; keep the provided writable cache and temporary mounts with the read-only
image. The optional built-in HTTPS listener uses container port 5056 only when
configured; add its port mapping if that listener is used instead of a proxy.

The files in `cloudron` and `coop-cloud` prepare platform-specific deployment.
The `startos` directory records the separate wrapper handoff. These files do
not establish marketplace acceptance or live-platform qualification. The
[release matrix](../../docs/maintainers/release-matrix.md) remains authoritative
for published support. Unraid is maintained separately. YunoHost publishing is
retired and is not restored by this recovery.
