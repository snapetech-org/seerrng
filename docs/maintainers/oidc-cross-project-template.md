# Cross-project OIDC integration template

This document is the shared implementation contract for OIDC sign-in in the
SnapeTech applications listed in the rollout map. The applications use five
runtime stacks, so the reusable unit is this protocol, configuration, and
security contract plus a native adapter for each stack. It is not a single
binary or language package. The adapter APIs and local session formats remain
native to each application; the browser flow, validation, admission, and
provider-token handling follow this contract.

## Provider presets and in-app identity

Every single-provider adapter accepts an optional provider hint. It changes
only the login label, local provider mark, and help link; it does not select
endpoints, weaken issuer validation, or grant authorization. The hint is a
lowercase catalog ID and unknown values fall back to `generic`:

```dotenv
<APP>_OIDC_PROVIDER=keycloak
```

Use [`oidc-provider-catalog.json`](./oidc-provider-catalog.json) for issuer
examples, scopes, official setup links, and provider-specific claim notes.
Login pages use bundled provider marks and link directly to the selected
provider's official setup guide; unknown IDs use the generic OIDC guide. They
never load a logo URL from the issuer or an unauthenticated request. SeerrNG is the
multi-provider exception: each configured provider already has a stable slug,
display name, and optional logo, so its existing name and logo take precedence
over a preset mark.

The icon sprite is shipped locally with each app so login branding does not
depend on a third-party image host. Provider marks remain trademarks of their
respective owners; the icon source project does not grant trademark rights.
The bundled brand paths are adapted from [Simple Icons](https://github.com/simple-icons/simple-icons);
its [disclaimer](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md)
explains that the project license does not itself grant rights to branded marks.

The common preset IDs are `google`, `microsoft-entra`, `okta`, `auth0`,
`keycloak`, `authentik`, `zitadel`, `amazon-cognito`, `gitlab`, `fusionauth`,
`onelogin`, `pingone`, and `jumpcloud`; the special supported preset is
`apple-sign-in`. Use `generic` for another
standards-compatible OIDC provider. The selected provider is presentation
metadata only: every adapter continues to use its configured issuer and
discovery metadata.

All nine native adapters implement Apple's special web flow: request only
`openid email`, send `response_mode=form_post`, accept a bounded
`application/x-www-form-urlencoded` callback, and send the signed client-secret
JWT in the token request body. Do not request `profile` or PKCE. The callback
transaction cookie uses `SameSite=None; Secure`. Treat `email_verified` as
verified only when it is the JSON boolean `true` or the exact string `"true"`;
reject missing or false values for email admission. Rotate the Apple client
secret before its maximum six-month expiry. These rules are selected by the
exact issuer `https://appleid.apple.com`; the provider hint never changes
protocol behavior.

Generic providers use Authorization Code with PKCE S256, query callbacks, and
the native client-auth method selected by each stack.

### Provider hint environment variables

| Application | Optional provider hint |
| --- | --- |
| SeerrNG | Per-provider `slug` and `name` in `settings.json`; logo is optional |
| slskR | `SLSKR_OIDC_PROVIDER` |
| slskdN | `SLSKD_OIDC_PROVIDER` / `web.authentication.oidc.provider` |
| TorrentNG | `TNG_OIDC_PROVIDER` or `RTNG_OIDC_PROVIDER` / `auth.oidc.provider` |
| IPTV Tunerr | `IPTV_TUNERR_WEBUI_OIDC_PROVIDER` |
| ROMarrNG | `ROMARR_OIDC_PROVIDER` |
| QuestarrNG | `QUESTARR_OIDC_PROVIDER` |
| BookshelfNG | `BOOKSHELF_OIDC_PROVIDER` |
| ChaptarrNG | `CHAPTARR_OIDC_PROVIDER` (legacy `BOOKSHELF_OIDC_PROVIDER` is accepted) |

The callback URI still comes from each app's setup guide. Register the exact
external HTTPS URI, including any reverse-proxy base path, with the provider.
The configured issuer remains authoritative even when the selected hint would
normally use a different issuer.

## Shared sign-in contract

Every app-level OIDC sign-in follows the same rules:

- Use OpenID Connect Authorization Code flow. Require PKCE with `S256` except
  for Apple's documented web flow. Every flow uses a cryptographically random
  one-time `state` and a cryptographically random `nonce` tied to the browser
  transaction.
- Keep the code exchange and ID-token validation on the server. Validate the
  signature using discovered provider keys, exact issuer, client audience,
  expiration, and the transaction nonce. Require a non-empty `sub`.
- Store transaction state server-side or in an integrity-protected,
  short-lived, `HttpOnly` correlation cookie. Use `SameSite=Lax` for query
  callbacks and `SameSite=None; Secure` for Apple's cross-site form-post.
  Consume it once and honor an explicitly configured public application URL
  behind a reverse proxy.
- Use the stable OIDC identity `(iss, sub)` as the account key when the app
  keeps per-user accounts. A verified email can satisfy an admission policy,
  but must not silently link an OIDC identity to a different local account.
  Account linking is a separate, authenticated action. Single-operator apps
  may use an admitted identity to open their existing operator session without
  creating a user account.
- Keep authorization in the app's existing role system. OIDC group claims do
  not grant administrator access. A new OIDC user receives the app's least
  privileged role or is denied until locally provisioned. For a single-
  operator app, an explicit email allow-list is the operator admission list;
  setting `allow_any_verified_user` grants every verified provider account
  that same operator access and must be treated as a privileged opt-in.
- Default to requiring `email_verified=true`. Deny sign-in unless the
  identity matches an explicit email/domain allow-list or an administrator
  enables the app's `allow_any_verified_user` option. Do not make an empty
  allow-list mean unrestricted access.
- Establish the app's normal local session after successful identity checks.
  Do not return ID/access tokens to browser JavaScript, put them in redirect
  URLs, or persist provider tokens unless the app has a separate provider API
  use case.
- Keep existing local/API-key login and recovery behavior unless the app has an
  explicit OIDC-only mode. Logout clears the app session; provider logout is
  optional and must not be presented as global single logout.
- Accept only same-origin, local return paths. Never use an unvalidated
  callback, issuer, or return URL supplied by a browser request.
- Require HTTPS issuers by default. Private-network issuers are allowed only
  through an explicit operator setting; discovery and JWKS HTTP clients must
  not follow redirects and must enforce bounded timeouts and response sizes.

## Shared provider configuration

Each native settings surface maps to these names and semantics. The UI or
configuration file may use app-specific prefixes, but the meaning stays the
same.

| Field | Required | Meaning |
| --- | --- | --- |
| `enabled` | yes | Makes OIDC sign-in available. Adapters may derive this from all required core fields being present rather than storing a separate flag. |
| `issuer_url` | yes | Exact OpenID Provider issuer identifier used for discovery and token validation. |
| `client_id` | yes | Registered confidential web client identifier. |
| `client_secret` | yes | Secret stored server-side and never returned in settings reads. |
| `redirect_uri` | yes | Exact externally registered callback URL, including any application base path. |
| `provider` | no | Optional display-only catalog ID used for a login label, local icon, and official setup link. It never changes issuer or validation. Unknown IDs use generic OIDC presentation. |
| `scopes` | no | Defaults to `openid profile email`; never remove `openid`. |
| `allowed_emails` | no | Exact, normalized email admissions. Requires a verified email claim. |
| `allowed_email_domains` | no | Explicit domain admissions. Requires a verified email claim. |
| `require_verified_email` | no | Defaults to `true`. |
| `allow_any_verified_user` | no | Defaults to `false`; when enabled, verified identities may enter under the app's native role policy. In a single-operator app this grants operator access. |
| `allow_private_issuer` | no | Defaults to `false`; permits intentional LAN/container IdPs after operator opt-in. |

An app may support multiple named providers. A single-provider adapter uses the
same fields without a provider collection. Secrets are write-only: a settings
read may report that a secret is configured, but never returns its value.

## Native adapter shape

The adapter owns provider discovery, transaction storage, callback validation,
identity admission, and conversion to the app's existing session. The frontend
only starts a redirect and receives a generic success/failure result.

1. Publish enabled state and the display-only provider ID without exposing the client secret.
2. Add a login action only when OIDC is enabled.
3. Start the flow with a fixed callback URI, state, nonce, and a PKCE verifier unless a documented provider protocol exception applies (currently Sign in with Apple).
4. Persist the transaction for one callback, with a ten-minute maximum lifetime.
5. On callback, exchange the code server-side and validate the ID token fully.
6. Apply verified-email admission, resolve `(iss, sub)`, and use local roles.
7. Issue the existing app session and redirect only to a validated local path.
8. Clear transaction data on success, provider error, expiry, and logout.
9. Log stable failure codes; never log codes, tokens, secrets, or raw claims.

Use the native, maintained OIDC implementation for the app's stack:

| Stack | Reference adapter |
| --- | --- |
| TypeScript / Node | `openid-client` |
| .NET | ASP.NET Core OpenID Connect authentication middleware |
| Rust | `openidconnect` with an async HTTP client that refuses redirects |
| Go | `coreos/go-oidc` plus `golang.org/x/oauth2` |
| Python | Authlib framework integration |

Do not hand-roll JWT, JWK, signature, issuer, or audience validation.

## Current rollout map

| App | Current state | Native session and identity mapping |
| --- | --- | --- |
| SeerrNG | Existing multi-provider OIDC audited; provider discovery, callbacks, admission, and explicit account linking are retained. | Native Seerr session and existing per-user role mapping. |
| slskR | OIDC sign-in implemented; upstream Soulseek login and Spotify integration remain separate. | Admitted identity receives the existing controller administrator session; `(iss, sub)` is carried in the app JWT. |
| slskdN | OIDC sign-in implemented alongside password/JWT/API-key auth; Solid-OIDC federation remains separate. | Existing JWT session; exact-email admission receives Administrator, while explicit allow-any receives ReadWrite. |
| TorrentNG | OIDC sign-in implemented alongside local login and API tokens. | Existing WebUI session; admitted identities use the app's operator access. OIDC sessions are revoked on logout. |
| IPTV Tunerr | OIDC sign-in implemented for the Control Deck only; IdP migration tooling remains separate. | Existing Control Deck cookie session; tuner and media endpoints are unchanged. |
| ROMarrNG | Direct OIDC sign-in implemented alongside local password/API-key auth and proxy ForwardAuth. | Existing signed operator session; local/API-key and ForwardAuth modes remain separate. |
| QuestarrNG | OIDC sign-in implemented alongside local user/password and JWT-cookie auth. | Creates a distinct local user keyed by a hash of `(iss, sub)`; no email-based account linking. |
| BookshelfNG | OIDC sign-in implemented alongside local/basic/forms/API-key auth. | Existing BookshelfNG authentication cookie and local authorization behavior. |
| ChaptarrNG | Existing single-provider OIDC audited and hardened for bounded responses and redirect refusal; local-login fallback remains. | Existing Chaptarr OIDC authentication method and local identity mapping. |

The apps have unrelated release branches and local working-tree changes. Keep
each app's implementation isolated to its own auth, config, UI, and operator
documentation surfaces; do not reset or overwrite unrelated work.

## Rollout review

Source implementations and setup documentation now cover all nine apps. The
shared protocol behavior is aligned, while the apps retain their existing
session formats, local role systems, URL-base conventions, and multi-provider
support where those already exist. Source review covered callback handling,
identity admission, local-session issuance, provider-token handling, and
backchannel limits at each adapter. Validation was run in each repository's
available focused or broader automated checks; the check scopes and results
are recorded in the [rollout validation record](oidc-rollout-validation.md).
No live identity-provider login was run because the rollout environment has no
provider registrations or credentials.

The remaining parity differences are deliberate application boundaries:

- SeerrNG keeps its multi-provider model and explicit account-linking flow.
- QuestarrNG creates a local user for each stable OIDC identity. Most other
  apps authenticate into an existing local session or operator surface.
- `allow_any_verified_user` is restricted to ReadWrite in slskdN. In the
  single-operator apps it grants the same operator access as an allow-listed
  identity; use it only when the provider itself restricts eligible users.
- OIDC logout clears the local app session. Global provider logout is not
  implemented.

## Standards and library references

- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0-18.html)
- [OAuth 2.0 Security Best Current Practice, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
- [PKCE, RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html)
- [OpenID Connect library references](https://openid.net/developers/certified/)
