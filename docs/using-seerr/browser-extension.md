---
title: SeerrNG Companion browser extension
description: Request titles from IMDb, Letterboxd, Steam, Goodreads, and other sites using your own SeerrNG server.
sidebar_position: 15
---

# SeerrNG Companion browser extension

[SeerrNG Companion](https://github.com/snapetech-org/seerrng-companion) is a standalone extension for Chrome, Edge, Brave, and Firefox. It adds a **Request in SeerrNG** button to title pages and a right-click **Find in SeerrNG** item, using SeerrNG's resolve API.

## Set up

1. Build or install the extension (see its README).
2. Create a scoped client token for your own account as described below. Use a separate token for each browser profile.
3. Open the extension's options, enter your SeerrNG address and the key, and choose **Save and test**. The browser asks for access to that one server only.

## Use

- On a supported title page, press the button. SeerrNG lists the matches with why each matched; press **Request** on the right one. Games and anime sources open in SeerrNG.
- Right-click a link, selected text, or an image and choose **Find in SeerrNG**.
- The toolbar popup resolves a pasted link, ISBN, or list of titles.

## Security notes

- The API key is stored only in the browser profile and used only by the extension's background worker, never by a web page.
- A scoped `sngc_` token acts as its issuing user, with only its explicit discovery/request routes. The user's current permissions, category rules, request quotas and approval rules still apply.
- The legacy key in **Settings → General** is a **full owner-level service credential**, regardless of which person copies it. Do not put that key in browser extensions. If it was shared with a browser profile, replace it there with a scoped token and rotate the legacy key; that rotation also affects other integrations using it.
- Tokens expire after 30 days by default (90 maximum). Revoking one token does not affect another client. A password/credential-version change invalidates the user's existing client tokens.
- Nothing is sent until you press a button or menu item.

## Keyboard and accessibility

The popup and options page use native controls with labels, so they work with the keyboard and screen readers. The in-page panel appears next to the button and returns focus to it when closed.

## Create and revoke a scoped token

Sign in to SeerrNG and open **Profile → Settings → Client Tokens**
(`/profile/settings/client-tokens`). Give the token a recognizable name,
choose **Discover and Request** for the companion extension, and select an
expiry. Press **Create Token**, copy the one-time value into the extension,
then dismiss it. Use **Revoke Token → Confirm Revocation** to disconnect a client.
Other users' profile settings do not expose your tokens, even to administrators.

The authenticated API at `/api/v1/auth/client-tokens` is also available.
Creation and revocation require an interactive cookie session and the normal
`X-XSRF-TOKEN` header when CSRF protection is enabled; a service or client key
cannot create other tokens. The endpoints are also documented in `/api-docs`.

- `POST /api/v1/auth/client-tokens` with JSON `{"name":"Firefox on laptop","scopes":["discover","request"],"days":30}` returns the plaintext `token` **once**. Copy that value into the extension's API key field. At most ten unexpired tokens may exist per user.
- `GET /api/v1/auth/client-tokens` lists your tokens' IDs, names, scopes and expiry, without the token values or their hashes.
- `DELETE /api/v1/auth/client-tokens/ID` revokes that token immediately. Create a replacement before revoking the old token when uninterrupted use matters.

`discover` permits resolving links/text/images, checking recognition capabilities,
searching, and selected video/game detail reads. `request` permits only creation
through `POST /request`. Both may read their own `/auth/me` identity. Neither
scope grants settings, user administration, request approval, playback,
provider-wide preferences, or token management. Image requests retain the same
resource and daily budgets as browser sessions. Send the token only in
`X-API-Key`, over HTTPS; never put it in a URL. Scoped bearer calls do not require
a browser CSRF cookie, and invalid bearer headers never fall back to a session.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
