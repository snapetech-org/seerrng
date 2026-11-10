# Scoped client API tokens

Scoped tokens let a client use a limited set of discovery and request endpoints
without receiving the administrator's global API key. They remain bound to the
issuing account's live permissions and credential version. They do not grant
administrator settings access.

## Create, list and revoke

Open **Profile → Settings → Client Tokens** while signed in to your own account.
Give the client a name, choose discovery/request access and an expiry, then
select **Create Token**. Copy the token before dismissing it or leaving the page.
To remove access, select **Revoke Token** and confirm. If you lose a token,
revoke it and create a replacement; its plaintext cannot be retrieved later.

The page offers 1, 7, 30 and 90-day expiry choices and keeps the one-time token
masked until you reveal it. Token management is available only for your own
account, including when you are an administrator.

Integrators can also use the authenticated API with a signed-in browser session
and the normal CSRF header for mutations:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/v1/auth/client-tokens` | List the current account's token metadata |
| POST | `/api/v1/auth/client-tokens` | Create a token with `name`, `scopes` and `days` |
| DELETE | `/api/v1/auth/client-tokens/:id` | Revoke one token belonging to the account |

Use `discover`, `request`, or both scopes. Names are 1–80 characters, expiry is
1–90 days (default 30), and at most ten unexpired tokens are allowed per account.
The creation response reveals the `sngc_` token once; listing never reveals it.
Store it as a secret and send it in `X-API-Key` to the permitted endpoints.
Do not put it in a URL or log. A client token cannot mint or revoke other tokens.

The allowlist intentionally does not expose every API operation. Request scope
permits supported movie/TV request creation and request-intent state; discovery
scope includes the supported discovery/resolve routes and intent capabilities.
Account permissions, quotas and availability rules still apply. Consult the
[allowlist](https://github.com/snapetech-org/seerrng/blob/main/server/lib/clientApiKeys.ts) before implementing a client;
see [quiet request intents](../integrations/pleazyng-quiet-requests.md).

Revocation, expiry and account credential changes invalidate the token. Use a
new interactive session if token management returns an authentication error.
Implementation: [token routes](https://github.com/snapetech-org/seerrng/blob/main/server/routes/clientApiKeys.ts) and
[token entity](https://github.com/snapetech-org/seerrng/blob/main/server/entity/ClientApiKey.ts).

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
