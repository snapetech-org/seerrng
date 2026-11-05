# Lumen

A request-first front end for [SeerrNG](https://github.com/snapetech-org/seerrng). It talks only to SeerrNG's API, so SeerrNG keeps doing the work (accounts, permissions, request limits, Sonarr/Radarr/ChaptarrNG and the rest) and Lumen is just the screens people use: Discover, Movies, Series, Books, Audiobooks, Search, Requests and their profile. Admins keep using SeerrNG itself for settings.

## Run it

**Step-by-step install and migration guide:** [docs/using-seerr/lumen.md](../docs/using-seerr/lumen.md). It covers new installs, adding Lumen to an existing SeerrNG, reverse proxies and tunnels, updating and switching back.

The quickest start is [`compose.yaml`](./compose.yaml), which runs SeerrNG and Lumen together:

```sh
curl -o compose.yaml https://raw.githubusercontent.com/snapetech-org/seerrng/main/lumen/compose.yaml
docker compose up -d
```

Already running SeerrNG? [`compose.lumen-only.yaml`](./compose.lumen-only.yaml) installs Lumen alone; set `SEERR_URL` in it to your SeerrNG.

Or build and run Lumen without Compose:

```sh
docker build -t lumen .
docker run -d -p 5080:80 \
  -e SEERR_URL=http://<seerrng-host>:5055 \
  -e SEERR_FULL_URL=https://seerr.example.com \
  lumen
```

Open `http://<host>:5080` and sign in with Plex or a SeerrNG local account. Point your public hostname at Lumen instead of SeerrNG if you want it to be the default. Lumen and SeerrNG share one origin through Lumen's nginx, so SeerrNG's sign-in cookie works unchanged.

| Variable | What it is |
| --- | --- |
| `SEERR_URL` | SeerrNG's address as the container sees it. `/api`, `/imageproxy` and `/avatarproxy` are proxied here. |
| `SEERR_FULL_URL` | Where people reach full SeerrNG. Links to pages Lumen doesn't have (issues, settings, users…) redirect here. |
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

The security suite starts disposable nginx containers from the pinned production image and removes only containers it creates. Browser tests run the production frontend against deterministic API fixtures at desktop, phone and tablet sizes. They verify account cache isolation, account-specific preferences, request navigation, layout overflow, and Plex link selection. They do not authenticate with Plex or prove application handoff on physical devices. Browser evidence is saved under `test-results/`.

Preferences and cached request descriptions are scoped to the signed-in SeerrNG user ID. Existing device-wide Lumen preferences are not imported into another person's account.
