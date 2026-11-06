---
title: Lumen, the request-first interface
description: Install Lumen in front of SeerrNG, move your users over to it, and switch back if you need to.
sidebar_position: 12
---

# Lumen, the request-first interface

Lumen is a separate, simpler front end for SeerrNG. It has the screens your users
actually use: Discover, Movies, Series, Books, Audiobooks, Search, Requests and
their profile. It works well on phones, and works with whichever media server
SeerrNG uses: **Plex**, **Jellyfin** or **Emby**. Lumen reads that from SeerrNG, so
every label matches your server ("On Jellyfin", "Watch on Plex"…).

**Watch on Plex** offers a link to the Plex app on supported phones and tablets. App
handoff depends on the installed Plex app and device settings; a browser link is also
available. **Watch on Jellyfin** and **Watch on Emby** open the title in your server's
web app.

Lumen doesn't replace SeerrNG. It runs **in front of** SeerrNG and only talks to
SeerrNG's API.

- **Your users** sign in to Lumen with the same Plex, Jellyfin, Emby or local
  account as before. Their requests, permissions and request limits don't change.
- **You, the admin**, keep using full SeerrNG for setup and settings: Sonarr,
  Radarr, users, notifications and so on. Lumen has no settings pages of its own.
  It sends anyone who opens a settings link to full SeerrNG.
- **Nothing is migrated or converted.** Lumen keeps no database. If you remove it,
  SeerrNG carries on exactly as before.

```text
 browser / phone ──► Lumen (port 5080) ──► SeerrNG (port 5055) ──► Plex or Jellyfin, Sonarr, Radarr…
 admin ──────────────────────────────────► SeerrNG (port 5055)
```

:::note
There is no prebuilt Lumen image yet. Docker builds it from this repository the
first time you start it, which takes a few minutes. After that, starting and
restarting are instant.
:::

## Before you start

You need **Docker** with the **Compose** plugin.

| Your system                     | What to install                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Windows or macOS                | [Docker Desktop](https://docs.docker.com/desktop/). Compose is included.                                           |
| Linux (Ubuntu, Debian, Fedora…) | [Docker Engine](https://docs.docker.com/engine/install/) and the Compose plugin (`docker-compose-plugin` package). |
| Synology                        | **Container Manager**. Use **Project** → **Create** and paste the compose file.                                    |
| TrueNAS SCALE                   | **Apps** → **Discover Apps** → **Custom App**, or **Install via YAML** and paste the compose file.                 |
| Unraid                          | The **Compose Manager** plugin, or see [Unraid without Compose](#unraid-without-compose).                          |

To check that Docker is ready, open a terminal (PowerShell on Windows) and run:

```sh
docker compose version
```

If it prints a version number, you're ready.

Now pick the section that fits you:

- [**A. New install**](#a-new-install-seerrng-and-lumen-together): you don't run SeerrNG yet.
- [**B. You already run SeerrNG**](#b-add-lumen-to-an-existing-seerrng): add Lumen next to it.
  Nothing in your SeerrNG changes except one setting, Trust Reverse Proxy.

## A. New install: SeerrNG and Lumen together

### 1. Make a folder and download the compose file

```sh
mkdir seerrng
cd seerrng
curl -o compose.yaml https://raw.githubusercontent.com/snapetech-org/seerrng/main/lumen/compose.yaml
```

No `curl`? Open
[lumen/compose.yaml](https://github.com/snapetech-org/seerrng/blob/main/lumen/compose.yaml),
click **Download raw file**, and save it in the folder as `compose.yaml`.

### 2. Create SeerrNG's config folder

SeerrNG runs as user ID 1000, so its config folder must belong to that user.

On **Linux** (including NAS terminals):

```sh
mkdir seerrng-config
sudo chown 1000:1000 seerrng-config
```

On **Windows or macOS** with Docker Desktop, just create the folder:

```sh
mkdir seerrng-config
```

### 3. Edit two lines

Open `compose.yaml` in any text editor.

- `TZ: Etc/UTC` → your time zone, for example `America/New_York` or `Europe/Berlin`.
- `SEERR_FULL_URL: http://localhost:5055` → the address people type to reach this
  machine, keeping `:5055`. For example `http://192.168.1.50:5055`. If you already
  have a domain for SeerrNG, use that, for example `https://seerr.example.com`.

### 4. Start it

```sh
docker compose up -d
```

The first start downloads SeerrNG and builds Lumen. When it's done, the command
returns to the prompt. To check that both containers are running:

```sh
docker compose ps
```

### 5. Set up SeerrNG

Open `http://<this-machine>:5055` and complete SeerrNG's setup wizard: sign in with
Plex, Jellyfin or Emby, connect your media server, and add Sonarr and Radarr. Lumen
picks up whichever server you choose here. The
[getting started guide](../getting-started/index.mdx) walks through it.

### 6. Turn on Trust Reverse Proxy

Go to **Settings → Network**, turn on **Trust Reverse Proxy**, and save. Then
restart SeerrNG:

```sh
docker compose restart seerrng
```

[Why this matters](#why-trust-reverse-proxy-matters).

### 7. Open Lumen

Go to `http://<this-machine>:5080` and sign in. Share this address with your users.

If you want people to reach it from outside your home, continue with
[Put Lumen behind your reverse proxy or tunnel](#put-lumen-behind-your-reverse-proxy-or-tunnel).

## B. Add Lumen to an existing SeerrNG

Your SeerrNG and its settings stay as they are. You're adding one container.

### 1. Find SeerrNG's address

Lumen needs an address it can reach SeerrNG on. Which one depends on how SeerrNG runs:

| How SeerrNG runs                                                       | `SEERR_URL` to use                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| In Docker Compose, and you'll add Lumen **to the same compose file**   | `http://<seerrng service name>:5055`, for example `http://seerrng:5055`              |
| In Docker, but in a separate compose file or `docker run`              | `http://<machine's LAN IP>:5055`, for example `http://192.168.1.50:5055`             |
| Installed directly (Windows, Linux package, Snap…) on the same machine | `http://host.docker.internal:5055` on Docker Desktop, otherwise the machine's LAN IP |
| On another machine                                                     | `http://<that machine's IP>:5055`                                                    |

If you changed SeerrNG's port, use your port instead of 5055.

### 2a. SeerrNG is already in a compose file

Add the `lumen` block under `services:` in that file, lined up with your existing
`seerrng:` service:

```yaml
services:
  seerrng:
    # ...your existing SeerrNG settings stay as they are...

  lumen:
    build: https://github.com/snapetech-org/seerrng.git#main:lumen
    image: seerrng-lumen:local
    container_name: lumen
    environment:
      SEERR_URL: http://seerrng:5055 # your SeerrNG service name and port
      SEERR_FULL_URL: http://192.168.1.50:5055 # where people open full SeerrNG
      LUMEN_TRUSTED_PROXIES: ''
    ports:
      - 5080:80
    restart: unless-stopped
```

Then run `docker compose up -d` in that folder.

### 2b. Anything else: use the Lumen-only file

This file installs Lumen alone. It works wherever SeerrNG runs: Docker, a Linux
package, Windows, or another machine.

```sh
mkdir lumen
cd lumen
curl -o compose.yaml https://raw.githubusercontent.com/snapetech-org/seerrng/main/lumen/compose.lumen-only.yaml
```

No `curl`? Open
[lumen/compose.lumen-only.yaml](https://github.com/snapetech-org/seerrng/blob/main/lumen/compose.lumen-only.yaml),
click **Download raw file**, and save it in the folder as `compose.yaml`.

Open `compose.yaml` in a text editor and change both addresses:

- `SEERR_URL`: from the table in step 1, for example `http://192.168.1.50:5055`.
- `SEERR_FULL_URL`: where people open full SeerrNG in their browser. This is often
  the same address, or your SeerrNG domain.

Then start it:

```sh
docker compose up -d
```

### 3. Turn on Trust Reverse Proxy

In full SeerrNG, go to **Settings → Network**, turn on **Trust Reverse Proxy**,
save, and restart SeerrNG. If it's already on because SeerrNG was behind a proxy
before, leave it on.

### 4. Try it, then move people over

Open `http://<this-machine>:5080` and sign in. Both interfaces work side by side,
so you can try Lumen for as long as you like before telling anyone.

When you're happy with it:

- **On your home network only**, share the new address (port 5080).
- **With a domain, reverse proxy or tunnel**, point it at Lumen instead of
  SeerrNG. See the next section. Your users keep the same address and see Lumen
  the next time they open it.

## Put Lumen behind your reverse proxy or tunnel

If people reach SeerrNG through a domain such as `https://requests.example.com`,
make that domain point at **Lumen** instead. Then give full SeerrNG its own address
(a second subdomain, or LAN only) and set `SEERR_FULL_URL` to it.

You need to change two things.

### 1. Point the proxy at Lumen

Change the proxy's target from SeerrNG to Lumen:

| Proxy                               | Old target                        | New target                                                     |
| ----------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| Cloudflare Tunnel (public hostname) | `http://seerrng:5055`             | `http://lumen:80`, or `http://<LAN IP>:5080`                   |
| Nginx Proxy Manager                 | `seerrng` port `5055`             | `lumen` port `80`, or LAN IP port `5080`                       |
| Caddy                               | `reverse_proxy seerrng:5055`      | `reverse_proxy lumen:80`                                       |
| Traefik                             | SeerrNG's router labels           | Move the labels to `lumen`, with `loadbalancer.server.port=80` |
| SWAG / plain nginx                  | `proxy_pass http://seerrng:5055;` | `proxy_pass http://lumen:80;`                                  |

Container names such as `lumen` only work when the proxy and Lumen are on the same
Docker network. Otherwise use the LAN IP and port 5080.

### 2. Tell Lumen to trust the proxy

Lumen ignores visitor-address headers unless they come from a proxy you list. This
is deliberate: otherwise anyone could pretend to be any address.

If you skip this step, everything still works, but SeerrNG sees every visitor as the
proxy's address. Everyone then shares one sign-in rate limit, and SeerrNG's logs
show the same address for all users.

Find your proxy's address:

- **Proxy on another machine:** that machine's IP, for example `192.168.1.10`.
- **Proxy in Docker on the same machine:** the Docker network's subnet. Run
  `docker network inspect <network> --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'`.
  For the default network use `bridge`. For a compose project use
  `<folder name>_default`, for example `seerrng_default`. You'll get something like
  `172.18.0.0/16`.

Prefer the proxy container's fixed address on a dedicated network when possible.
Trusting a whole Docker subnet also trusts every other container on that network
to report visitor identities. Keep untrusted containers off that network.

Then set it on the Lumen service and run `docker compose up -d` again:

```yaml
services:
  lumen:
    # ...the rest of Lumen's settings...
    environment:
      LUMEN_TRUSTED_PROXIES: 172.18.0.0/16 # your proxy's IP or subnet; separate several with commas
      LUMEN_REAL_IP_HEADER: X-Forwarded-For # Cloudflare Tunnel: CF-Connecting-IP
```

`LUMEN_REAL_IP_HEADER` is the header your proxy puts the visitor's address in:

| Proxy                                                  | `LUMEN_REAL_IP_HEADER`          |
| ------------------------------------------------------ | ------------------------------- |
| Cloudflare Tunnel (`cloudflared`)                      | `CF-Connecting-IP`              |
| Nginx Proxy Manager, SWAG, Caddy, Traefik, plain nginx | `X-Forwarded-For` (the default) |

:::warning
Trust only your proxy. Don't use `0.0.0.0/0`, and don't list your whole LAN unless
the proxy really is somewhere on it with no fixed address. Anything you list can
claim to be any visitor.
:::

To check it works, sign in through your domain, then look at SeerrNG's logs
(`docker compose logs seerrng`). Sign-ins should show your real public address,
not a `172.x` or LAN address.

## Why Trust Reverse Proxy matters

SeerrNG limits failed sign-ins per visitor address. With Lumen in front, every
request reaches SeerrNG from Lumen's container. Lumen passes on the real visitor's
address, but SeerrNG only reads it if **Trust Reverse Proxy** is on. With it off,
SeerrNG treats all your users as one visitor, and a few wrong passwords can lock
out everyone for a while.

With Trust Reverse Proxy on, SeerrNG believes whatever sits directly in front of
it. Direct clients reaching SeerrNG can therefore supply forwarding headers too,
including clients on your home network. Keep SeerrNG's own port (5055) off the
internet and restrict direct access to trusted administrators: don't port-forward
it or point a public tunnel at it. To allow access only from the Docker host,
publish it as `127.0.0.1:5055:5055` and use it from that machine or over SSH.
Lumen still reaches SeerrNG over their shared Docker network.

## Admin defaults for everyone (optional)

Each user can turn parts of Lumen on and off on their **You** page: Discover rows,
quick request on posters, whole-series requests, narrator choice for audiobooks,
and showing books at all. You can set the defaults, and lock any of them, with a
`lumen-config.json` file:

1. Save this as `lumen-config.json` next to `compose.yaml`, and change what you like:

   ```json
   {
     "seerrPublicUrl": "https://seerr.example.com",
     "mediaServer": "auto",
     "defaults": {
       "narratorChoice": true,
       "hoverRequest": true,
       "wholeSeriesDefault": true,
       "showBooks": true,
       "theme": "dark",
       "rows": { "genres": true, "comingSoon": true }
     },
     "locked": []
   }
   ```

   - `seerrPublicUrl` is the full-SeerrNG link shown on the **You** page.
   - `mediaServer` picks the media server Lumen signs people in with and names in
     its labels. Leave it at `"auto"` to follow SeerrNG's own setting (see
     [Plex, Jellyfin and Emby](#plex-jellyfin-and-emby)), or set `"plex"`,
     `"jellyfin"` or `"emby"`.
   - Put setting names in `locked` to stop users changing them, for example
     `"locked": ["showBooks"]`.

2. In `compose.yaml`, remove the `#` from the two `volumes:` lines under `lumen`.
3. Run `docker compose up -d`.

Create the file **before** you uncomment those lines. If the file is missing, Docker
creates a folder with that name instead, and Lumen ignores it.

## Plex, Jellyfin and Emby

Lumen asks SeerrNG which media server it uses and follows it. That's the server
SeerrNG was set up with during its setup wizard (its connection settings are under
**Settings → Plex** or **Settings → Jellyfin** in full SeerrNG). Nothing needs
setting up in Lumen.

What changes with the server:

| | Plex | Jellyfin | Emby |
| --- | --- | --- | --- |
| Sign-in button | Continue with Plex (Plex pop-up) | Continue with Jellyfin (username and password) | Continue with Emby (username and password) |
| Quick Connect | – | Yes: Lumen shows a code to enter in a signed-in Jellyfin app | – |
| Labels | On Plex, Watch on Plex, New on Plex | On Jellyfin, Watch on Jellyfin, New on Jellyfin | On Emby, Watch on Emby, New on Emby |
| Watch button opens | The Plex app on phones and tablets, Plex Web elsewhere | Jellyfin's web app | Emby's web app |

Lumen also follows SeerrNG's sign-in switches in **Settings → Users**: if local
(email and password) sign-in is off, Lumen hides it; if Jellyfin is set to Quick
Connect only, Lumen goes straight to the code. The **Forgot password?** link on the
Jellyfin and Emby sign-in uses SeerrNG's Jellyfin forgot-password URL, or your
server's own reset page.

To override what SeerrNG reports (for example while you move from Plex to Jellyfin),
set `"mediaServer"` in [`lumen-config.json`](#admin-defaults-for-everyone-optional).
This only changes Lumen's sign-in and labels: people can only sign in with a server
that SeerrNG is connected to. The **You** page shows which server Lumen is using and
whether it came from SeerrNG or from `lumen-config.json`.

## Updating

Run this in the folder with `compose.yaml`:

```sh
docker compose pull --ignore-buildable
docker compose build --pull
docker compose up -d
```

`pull` updates SeerrNG (`--ignore-buildable` skips Lumen, which is built rather than downloaded). `build --pull` rebuilds Lumen from the latest code. Users
get the new version the next time they open or refresh Lumen. With the Lumen-only
file, `pull` has nothing to update. Update your SeerrNG the way you always have.

## Switching back

Lumen changes nothing in SeerrNG, so going back takes two steps:

1. Point your proxy or tunnel back at SeerrNG, or tell people the old address again.
2. Stop Lumen with `docker compose stop lumen`, or delete its service from the file
   and run `docker compose up -d --remove-orphans`.

You can leave **Trust Reverse Proxy** on if SeerrNG is still behind a proxy.
Otherwise turn it off.

## Troubleshooting

**I still see the old version (or full SeerrNG) after switching.**
Your browser cached it. Refresh the page. On a phone, close the tab or installed
app completely and reopen it. If you had full SeerrNG installed as an app on the
home screen, open it once and it switches to Lumen.

**"502 Bad Gateway", or sign-in fails straight away.**
Lumen can't reach SeerrNG, which means `SEERR_URL` is wrong. Check it from inside
the Lumen container:

```sh
docker compose exec lumen wget -qO- http://seerrng:5055/api/v1/status
```

Replace the address with your `SEERR_URL`. It should print SeerrNG's version. If it
doesn't, use the LAN IP instead of a container name, or the other way round.

**Lumen exits right after starting.**
Run `docker compose logs lumen`. A message about `LUMEN_TRUSTED_PROXIES` or
`LUMEN_REAL_IP_HEADER` means a value isn't allowed. Proxies must be IPs or CIDRs
separated by commas. The header must be `X-Forwarded-For`, `CF-Connecting-IP` or
`X-Real-IP`.

**SeerrNG won't start: "permission denied" on `/app/config`.**
The config folder doesn't belong to user 1000. On Linux, run
`sudo chown -R 1000:1000 seerrng-config`.

**Settings, Users or Issues pages go to the wrong address.**
Those pages live in full SeerrNG. Set `SEERR_FULL_URL` to the address people use
to open it, then run `docker compose up -d`. Full SeerrNG on a different address
has its own sign-in, so admins sign in there once as well.

**Everyone got "too many attempts" at once.**
SeerrNG is seeing every user as one address. Turn on **Trust Reverse Proxy**
([step 6](#6-turn-on-trust-reverse-proxy)) and, behind a proxy, set
`LUMEN_TRUSTED_PROXIES`.

**The Lumen build fails, mentioning `git`.**
Docker needs Git to build from a GitHub address, and some NAS systems don't have it.
Download the repository instead (`git clone https://github.com/snapetech-org/seerrng.git`,
or **Code → Download ZIP** on GitHub and unzip it) into the folder with `compose.yaml`.
If using the ZIP download, rename the extracted folder to `seerrng`.
Then change the `build:` line to `build: ./seerrng/lumen`.

**Watch on Plex opens the Plex home screen instead of the title.**
Update Lumen. Older builds used a link the Android Plex app ignores.

**Lumen says Plex but you use Jellyfin (or the other way round).**
Check which server tab full SeerrNG's **Settings** shows (Plex or Jellyfin), and check that
`lumen-config.json` doesn't set `"mediaServer"` to something else. Lumen reads both
when the page loads, so reload after changing either.

**Jellyfin Quick Connect says the code expired.**
Codes last a few minutes. Make sure Quick Connect is turned on in Jellyfin's
**Dashboard → General**, then press **Use Quick Connect instead** again for a new
code.

## Unraid without Compose

Add Lumen as a container using **Add Container** with these settings:

1. Build the image once in the Unraid terminal:
   `docker build -t seerrng-lumen:local https://github.com/snapetech-org/seerrng.git#main:lumen`
2. **Add Container**:
   - **Repository:** `seerrng-lumen:local`
   - **Network type:** bridge
   - **Port:** container port `80`, host port `5080`
   - **Variables:** `SEERR_URL` = `http://<Unraid IP>:5055`, and `SEERR_FULL_URL`.
     Add `LUMEN_TRUSTED_PROXIES` = `172.17.0.0/16` and `LUMEN_REAL_IP_HEADER` =
     `CF-Connecting-IP` if a Cloudflare Tunnel container on the default bridge sits
     in front of it.
3. To update, run the `docker build` command again, then restart the container.
