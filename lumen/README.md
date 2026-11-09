# Lumen

## Choose the interface you want

| Situation | What to do |
| --- | --- |
| Already running SeerrNG | Keep your existing address. Upgrades preserve full SeerrNG. No companion is required. |
| Want the included Lumen | Open `/lumen/` on your SeerrNG server. To make it the home page, use **Full SeerrNG → Settings → General → Default Interface → Included Lumen**, then save. |
| Already configured a Lumen companion | Keep using its existing address, usually port 5080. Select **Configured Lumen companion** in General settings and enter that address if you want SeerrNG’s home page to send people there. |
| Need the native interface | Open `/seerrng` on your SeerrNG server. This works before sign-in. Lumen also has **Open full SeerrNG** on its sign-in page. |

Included Lumen and the companion have separate presentation settings and branding.
The included copy saves under SeerrNG’s existing config volume; the companion uses
its own `/lumen-data` mount. Neither creates another SeerrNG database or changes
requests, accounts, or media-server configuration. Fresh installs start with the
included Lumen after setup.

### Companion permissions: the short version

No additional container is needed for included Lumen. For an independently deployed
companion, download `lumen/compose.lumen-only.yaml`, enter the two SeerrNG addresses,
and create a `.env` file **next to the Compose file**:

```dotenv
PUID=1000
PGID=1000
```

Create the data folder owned by that user, then start:

```sh
mkdir -p lumen-data
sudo chown 1000:1000 lumen-data
docker compose up -d lumen
```

The supplied Compose file uses these host-side values in `user:` and the `/tmp`
tmpfs. **Do not put `user:`, PUID, or PGID under the service’s `environment:`.**
If editing your own stack, this is the complete placement (adapt the addresses and
host data path):

```yaml
services:
  lumen:
    image: ghcr.io/snapetech-org/seerrng-lumen:latest
    user: "1000:1000"
    environment:
      SEERR_INTERNAL_URL: http://seerrng:5055
      SEERR_BROWSER_URL: http://your-server:5055
    ports:
      - "5080:80"
    volumes:
      - ./lumen-data:/lumen-data
    read_only: true
    tmpfs:
      - /tmp:uid=1000,gid=1000,mode=1777
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    restart: unless-stopped
```

The image defaults to UID/GID 101:101 when no Docker user is selected. It supports
1000:1000 directly; it does not remap users through LinuxServer-style container
environment variables. Current images keep nginx’s temporary files under `/tmp`;
the old `/etc/nginx/conf.d` and `/var/cache/nginx` tmpfs workaround is unnecessary.
**Lumen settings for everyone** shows storage problems and the actual UID/GID.
After correcting the mount or ownership, select **Check storage again**; your draft
is preserved. Never use `chmod 777` to work around ownership.



Lumen is bundled with SeerrNG. Fresh installs use P’s original dark Lumen
presentation after setup; existing installations retain native home access until
an administrator selects a different default in Settings → General. The sign-in
page offers **Open full SeerrNG** without requiring an account first. The companion
container remains optional and keeps its own branding and configuration.

The app stores shared presentation settings under its existing configuration
volume, in `lumen/config.json`. Administrator saves use the authenticated API;
only public presentation values belong in this file, never API keys or secrets.
Branding uploads are bounded raster images re-encoded as PNG. The separate
companion deployment below remains supported with its existing root paths.

A request-first front end for [SeerrNG](https://github.com/snapetech-org/seerrng). It talks only to SeerrNG's API, so SeerrNG keeps doing the work (accounts, permissions, request limits, Sonarr/Radarr/ChaptarrNG and the rest) and Lumen is just the screens people use: Discover, Movies, Series, Books, Audiobooks, Search, Requests and their profile. Service and account administration remain in full SeerrNG; Lumen has its own presentation settings.

## Run it

**Step-by-step install and migration guide:** [docs/using-seerr/lumen.md](../docs/using-seerr/lumen.md). It covers new installs, adding Lumen to an existing SeerrNG, reverse proxies and tunnels, updating and switching back.

For a separate companion alongside a new server, [`compose.yaml`](./compose.yaml) runs both containers. Create the config/data directories first as described above; included Lumen needs neither this stack nor a second container:

```sh
curl -o compose.yaml https://raw.githubusercontent.com/snapetech-org/seerrng/main/lumen/compose.yaml
docker compose up -d
```

Already running SeerrNG? [`compose.lumen-only.yaml`](./compose.lumen-only.yaml) installs Lumen alone; set `SEERR_INTERNAL_URL` in it to your SeerrNG.

Prebuilt images support amd64 and arm64. To update either Compose install, run
`docker compose pull && docker compose up -d`. Use `:v3.72.27` instead of `:latest`
to pin a release.

Or run the published image without Compose:

```sh
docker run -d -p 5080:80 \
  -e SEERR_INTERNAL_URL=http://<seerrng-host>:5055 \
  -e SEERR_BROWSER_URL=https://seerr.example.com \
  ghcr.io/snapetech-org/seerrng-lumen:latest
```

For local development, `docker build -t seerrng-lumen:local .` builds from this
folder; run that local tag instead. The Compose examples retain a commented build
fallback.

The container runs as the unprivileged `nginx` user; its static app remains read-only, and only its generated proxy configuration, cache and temporary PID location are writable.

Open `http://<host>:5080` and sign in with Plex, Jellyfin, Emby or a SeerrNG local account. Lumen follows the media server SeerrNG is set up with; set `"mediaServer"` in `lumen-config.json` (`"auto"`, `"plex"`, `"jellyfin"` or `"emby"`) to override it. Point your public hostname at Lumen instead of SeerrNG if you want it to be the default. Lumen and SeerrNG share one origin through Lumen's nginx, so SeerrNG's sign-in cookie works unchanged.

| Variable | What it is |
| --- | --- |
| `SEERR_INTERNAL_URL` | SeerrNG's address as the container sees it (older name `SEERR_URL` still works). `/api`, `/imageproxy` and `/avatarproxy` are proxied here. |
| `SEERR_BROWSER_URL` | Where people open full SeerrNG in their browser (older name `SEERR_FULL_URL` still works). Links to pages Lumen doesn't have (issues, settings, users…) redirect here. |
| `SEERR_EXTRAS_URL` | Optional companion service for the narrator extras (see below). Without it Lumen uses SeerrNG alone. |
| `LUMEN_TRUSTED_PROXIES` | Addresses or CIDRs of the reverse proxy or tunnel in front of Lumen, comma separated (e.g. `172.17.0.0/16`). Only these may tell Lumen who the visitor is. Empty (the default) = the address that connected. |
| `LUMEN_REAL_IP_HEADER` | The header that proxy puts the visitor's address in: `X-Forwarded-For` (default) or `CF-Connecting-IP`. |

### Behind a reverse proxy or tunnel

SeerrNG trusts one proxy hop, so the address Lumen passes on is the one SeerrNG sees, and SeerrNG limits sign-in attempts per address. Lumen never forwards a client's own `X-Forwarded-For`, `CF-Connecting-IP` or `X-Forwarded-Proto`; it believes them only from `LUMEN_TRUSTED_PROXIES`. If Lumen sits behind Cloudflare Tunnel, nginx, Traefik or similar, set `LUMEN_TRUSTED_PROXIES` to that proxy's address (for a tunnel container on the same Docker network, that network's subnet), or SeerrNG will see every visitor as the proxy and they will share one rate limit. Keep the trusted range tight, and don't publish Lumen's port anywhere the proxy's range can be reached from.

## Develop

```sh
npm install
SEERR_URL=http://localhost:5055 npm run dev
```

Vite serves the app on :5173 and proxies `/api`, `/imageproxy` and `/avatarproxy` to SeerrNG, the same way the container does.

Most test servers have no comics, magazines, games, sports or adult service connected. `LUMEN_MOCKS=1 npm run dev` answers those endpoints with sample data in SeerrNG's response shapes (`mocks/extras.mjs`) and turns every category on, so their pages can be worked on and tested. Requests made there are kept in memory and never sent anywhere; music still uses the real server.

## Settings

Each person can switch parts of Lumen on and off on their **You** page: Discover rows, quick request on posters, whole-series requests, narrator choice for audiobooks, and books altogether. Admins set the defaults for everyone, and can lock any of them, with a `lumen-config.json` next to the app (mount it at `/usr/share/nginx/html/lumen-config.json`). See `public/lumen-config.example.json`.

Turning **narrator choice** off removes every narrator widget: audiobooks get one straight "Request audiobook" button and the best available recording is used.

## Pages

- Discover, Movies, Series, Books, Audiobooks, Search (scoped to the section you came from), Requests, Coming soon and You.
- Movie, series and book pages: season picker, narrator picker, admin request options (server, quality, folder).
- Music (albums, artists), Comics, Magazines, Games (PC, retro and modern consoles), Sports and Adult. Each appears in the menus only when SeerrNG has the category turned on (Adult also needs SeerrNG's adult switch) **and** its catalogue answers, so a category that's on with no service behind it stays out of the way. Opening one by URL explains why it isn't there. SeerrNG still checks every call, including each person's category and adult permissions.

## The companion service (optional)

A few book features need ChaptarrNG data that SeerrNG's API doesn't expose yet. Lumen asks for them at `/seerr-classic/…`, which nginx passes to `SEERR_EXTRAS_URL`:

| Path | Used for |
| --- | --- |
| `GET /seerr-classic/hcsearch?q=` | Book search by Hardcover id, with per-format library state |
| `GET /seerr-classic/hccovers?ids=` and `/seerr-classic/hcimg/…` | Real ebook covers instead of square audiobook art |
| `GET /seerr-classic/lookup?f=audiobook&d=hc&id=` | Every narration of a book, for the narrator picker |
| `POST /seerr-classic/narration` | "Request another narrator" for a book already in the library |

Lumen checks the current SeerrNG session before forwarding companion calls. The companion must also validate the caller’s identity, category permissions, request approval rules and quotas; a successful session check does not authorize every action. Do not expose an unauthenticated acquisition service as this upstream.

Without the companion, search falls back to SeerrNG's own book search and the narrator picker shows what SeerrNG returns. Native SeerrNG endpoints for these would remove the need for it.

## Validate

From this directory, use Node.js 24 and a local Docker daemon:

```sh
npm ci --ignore-scripts
npm run build
npm test
npx --no-install playwright install --with-deps chromium
npm run test:browser
```

The security suite builds the production image, verifies its non-root process identity, and tests disposable nginx containers with all Linux capabilities dropped and no new privileges. It removes only the containers and test image it creates. CI scans an archive of that same built image and rejects fixable HIGH or CRITICAL dependency vulnerabilities; repository ignore files cannot suppress that gate. Browser tests run the production frontend against deterministic API fixtures at desktop, phone and tablet sizes. They verify account cache isolation, account-specific preferences, request navigation, layout overflow, and Plex link selection. They do not authenticate with Plex or prove application handoff on physical devices. Browser evidence is saved under `test-results/`.

Preferences and cached request descriptions are scoped to the signed-in SeerrNG user ID. Existing device-wide Lumen preferences are not imported into another person's account.
