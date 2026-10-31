---
title: Network
description: Configure Network settings.
sidebar_position: 7
---

# Network

Network-related settings are available in the **Network** tab under **Settings**. These options control how Seerr communicates with external services

## DNS Caching

Seerr allows you to enable DNS caching if you are experiencing DNS-related issues. When enabled, it improves performance and reduces the number of DNS lookups required for external API calls. This can help speed up response times and reduce the load on DNS servers, especially when a local resolver like Pi-hole is used.

### Configuration

You can enable the DNS caching settings in the Network tab of the Seerr settings. The default values follow the standard DNS caching behavior.

- **Force Minimum TTL**: Set a minimum time-to-live (TTL) in seconds for DNS cache entries. This ensures that frequently accessed DNS records are cached for a longer period, reducing the need for repeated lookups. Default is 0.
- **Force Maximum TTL**: Set a maximum time-to-live (TTL) in seconds for DNS cache entries. This prevents infrequently accessed DNS records from being cached indefinitely, allowing for more up-to-date information to be retrieved. Default is -1 (unlimited).

## Force IPv4 resolution first

Sometimes there are configuration issues with IPv6 that prevent the hostname resolution from working correctly.

You can force resolution to prefer IPv4 by going to `Settings > Network`, enabling `Force IPv4 Resolution First`, and then restarting Seerr.

## HTTP(S) Proxy

If you can't change your DNS servers or force IPV4 resolution, you can use Seerr through a proxy.

In some places (like China), the ISP blocks not only the DNS resolution but also the connection to the TMDB API.

## Enable Proxy Support

If you have Seerr behind a reverse proxy, enable this setting to allow Seerr to correctly register client IP addresses. For details, please see the [Express Documentation](https://expressjs.com/en/guide/behind-proxies.html).

This setting also controls whether Seerr trusts your proxy's `X-Forwarded-Proto` header when deciding whether the CSRF cookies (below) should be marked `Secure`. If you run CSRF protection behind an HTTPS-terminating reverse proxy, enable this setting too — otherwise Seerr cannot tell the proxied connection is HTTPS.

This setting is **disabled** by default.

## Enable CSRF Protection

:::warning
**This is an advanced setting.** Please only enable this setting if you are familiar with CSRF protection and how it works.
:::

CSRF stands for [cross-site request forgery](https://en.wikipedia.org/wiki/Cross-site_request_forgery). When this setting is enabled, all external API access that alters Seerr application data is blocked.

If you do not use Seerr integrations with third-party applications to add/modify/delete requests or users, you can consider enabling this setting to protect against malicious attacks.

The CSRF cookie is marked `Secure` on direct HTTPS, or behind a reverse proxy that forwards `X-Forwarded-Proto: https` **and** has [Enable Proxy Support](#enable-proxy-support) turned on. If you're behind a reverse proxy, enable proxy support so Seerr can identify the HTTPS connection safely.

If you enable this setting and find yourself unable to access Seerr, you can disable the setting by modifying `settings.json` in `/app/config`.

This setting is **disabled** by default.

## Private Jellyfin/Emby Setup Hostnames

The first-run setup wizard accepts a Jellyfin/Emby hostname that resolves to a private or local address (a LAN IP, a `.local` hostname, or a Docker-internal hostname) by default, since that is how the overwhelming majority of self-hosted media servers are reachable.

If your SeerrNG instance might be reachable on the public internet before you finish the setup wizard, an attacker could otherwise race you to it and point the Jellyfin/Emby hostname at an internal address to probe your network. Set the environment variable `SEERR_REQUIRE_PUBLIC_SETUP_HOSTS=true` to restore the stricter check and reject private-address hostnames during setup. This does not affect Jellyfin/Emby hostnames configured later from Settings.

This setting is **disabled** by default (private hostnames are allowed).

## Private Notification and Push URLs

Notification agent URLs (Discord, Slack, generic webhook, ntfy, Gotify) and web push subscription endpoints are validated to reject private/internal addresses by default. This blocks a malicious or careless URL from making SeerrNG's server issue requests into your internal network (SSRF).

If you run your own notification receiver on your LAN or Docker network (a self-hosted ntfy or Gotify instance, for example), that validation will reject its URL. Set `SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS=true` to allow private-address notification URLs. Web push subscription endpoints are separate and almost always a public browser push service; set `SEERR_ALLOW_PRIVATE_PUSH_ENDPOINTS=true` only if you know you need it.

Both settings are **disabled** by default.

## Session cookies, built-in HTTPS, and HTTP

Plex, local, and other browser sign-ins use an `HttpOnly` session cookie. The
default `SEERR_TLS_MODE=disabled` listener uses a transport-aware cookie, so
direct HTTP can persist a login while showing a warning. Configure an HTTPS
reverse proxy or use SeerrNG's built-in local TLS for encrypted browser
sessions.

Direct HTTP authentication is enabled by default when built-in TLS is disabled,
shows a startup/UI warning, and allows anyone observing the LAN traffic to
steal a session cookie. Set `SEERR_ALLOW_HTTP_AUTH=false` to require HTTPS for
direct browser sign-in; setting it to `true` makes the default explicit. HTTP
authentication is mutually exclusive with an enabled `SEERR_TLS_MODE`, and
SeerrNG refuses to start if both are enabled. The same choice is available in
**Browser Transport Security** after checking the required risk acknowledgement.

### Browser Transport Security

The **Browser Transport Security** section controls the application’s own
listeners. It is separate from the outbound HTTP(S) proxy setting:

- **Disabled** leaves HTTPS off. Direct HTTP login works by default with a
  warning; disable **Allow authenticated browser sessions over HTTP** when
  direct browser access must require HTTPS.
- **Self-signed local HTTPS** generates and persists a local CA and server
  certificate under `CONFIG_DIRECTORY/tls`.
- **Provided certificate** reads certificate paths mounted into the SeerrNG
  process. Private keys are never uploaded through the UI.
- With a provided certificate, **Show Certificate Notice on Login** controls
  the informational certificate and fingerprint panel on login and setup
  pages. It does not hide warnings that block an unsafe or incomplete browser
  transport.
- **Redirect HTTP to HTTPS** is intentionally separate. Leave it off while
  verifying the HTTPS URL and certificate trust; HTTP then returns an upgrade
  instruction instead of serving the application.
- **Allow authenticated browser sessions over HTTP** is enabled by default only
  when HTTPS is disabled and requires an explicit acknowledgement when changed
  from the Network page.

All listener and cookie-policy changes require a restart. Existing installations
are migrated to the working direct-HTTP default when their built-in TLS mode is
disabled. If a bad certificate configuration prevents access, set
`SEERR_TLS_MODE=disabled` and restart as the documented recovery override.
Environment variables take precedence over saved settings, and the page
identifies those overrides.

See [Built-in HTTPS and HTTP authentication modes](/using-seerr/advanced/built-in-tls)
for the complete first-run flow, trust procedure, environment variables, and
recovery steps.

## API Request Timeout

The API Request Timeout setting defines the maximum time (in seconds) Seerr will wait for a response from external services, such as Radarr or Sonarr. The default value is 10 seconds, though it can be entirely disabled by setting it to 0. Please note that any changes to this value require restarting Seerr to take effect.

Enforcing a timeout ensures the Seerr interface remains responsive and prevents infinite loading states when a connected service unexpectedly goes offline. Conversely, you may want to increase this value if you frequently experience failed requests due to your external services being slow to respond, which often happens when they are under heavy load or querying network-mounted storage.

## Outbound request identity

SeerrNG adds a versioned Seerr/<version> User-Agent to its server-side Axios
requests when an integration has not supplied a protocol-specific value. This
includes remote image requests handled by the image proxy. Provider-specific
User-Agent values are preserved. Remote services can use this header to identify
the software version; it does not contain a SeerrNG account or request identity.

This extends the outbound request identification work in [Seerr PR #3395](https://github.com/seerr-team/seerr/pull/3395).
