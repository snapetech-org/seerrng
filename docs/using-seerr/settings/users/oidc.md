---
title: OpenID Connect
description: Configure and operate OpenID Connect sign-in in SeerrNG.
sidebar_position: 2.5
---

# OpenID Connect sign-in

SeerrNG supports one or more OpenID Connect providers for browser sign-in and
account linking. It uses the provider's authorization-code flow on the server,
then issues SeerrNG's existing local session. Provider tokens are not handed to
browser JavaScript or used as SeerrNG sessions. Local login and media-server
sign-in continue to follow their own settings.

This guide covers SeerrNG's provider configuration and behavior. See the
[cross-project OIDC contract](../../../maintainers/oidc-cross-project-template.md)
for the shared protocol/security rules and the
[provider catalog](../../../maintainers/oidc-provider-catalog.md) for all
supported provider IDs, official setup links, issuer examples, and provider
claim notes.

## Before you start

- Configure SeerrNG's **Application URL** to the exact public HTTPS origin and
  any reverse-proxy base path. SeerrNG uses that setting when it creates OIDC
  redirect URIs.
- Decide whether a provider is for existing users to link from **Profile →
  Settings → Linked Accounts**, new-user registration, or both.
- Keep a working local or media-server sign-in available while setting up and
  testing OIDC.
- Create a confidential web client in the provider. Use its exact issuer
  identifier and register the callback URLs in the next section.

## Configure providers

OIDC provider definitions are stored in the server-side `oidc.providers` array
in SeerrNG's `settings.json`. The global `main.oidcLogin` flag controls whether
the configured providers appear on the login page. There is no separate
provider-secret editor in the user settings page. Keep the file in the
deployment's protected configuration volume, outside source control, and
restrict access to it because it contains client secrets.

Add one entry per provider, then enable OIDC:

```jsonc
{
  "main": {
    "oidcLogin": true,
    "applicationUrl": "https://requests.example.com"
  },
  "oidc": {
    "providers": [
      {
        "slug": "keycloak",
        "name": "Keycloak",
        "issuerUrl": "https://id.example.com/realms/media",
        "clientId": "seerrng",
        "clientSecret": "replace-with-the-client-secret",
        "scopes": "openid profile email",
        "newUserLogin": true,
        "allowedEmailDomains": ["example.com"],
        "groupClaim": "groups",
        "allowedGroups": ["seerr-users", "seerr-admins"],
        "roleClaim": "groups",
        "roleMappings": [
          { "value": "seerr-admins", "role": "admin" },
          { "value": "seerr-users", "role": "user" }
        ]
      }
    ]
  }
}
```

Keep each `slug` stable after users have linked that provider. The `name` is
shown to users. The optional `logo` can supply administrator-configured
branding; when it is absent, recognized provider slugs use a bundled local
mark and unknown slugs use the generic OpenID Connect mark. The login entry
links to official provider setup help. Branding does not choose the issuer or
change validation.

| Field | Meaning |
| --- | --- |
| `oidcLogin` | Global login-page switch. When false, SeerrNG does not offer OIDC sign-in. |
| `slug` | Stable provider ID used in URLs and account links. Use a lowercase catalog ID or another stable ID. |
| `name` | User-visible provider name. |
| `issuerUrl` | Exact OpenID Provider issuer identifier; do not append `/.well-known/openid-configuration`. |
| `clientId` / `clientSecret` | Confidential web client credentials; keep the secret server-side. |
| `scopes` | Space-separated scopes; defaults to `openid profile email`. Keep `openid` and include `email` for verified-email admission. |
| `requiredClaims` | Optional space-separated boolean claims that must be true before login is accepted. |
| `newUserLogin` | Allows first-time account creation through this provider. Existing accounts are not linked by matching email. |
| `allowedEmailDomains` | Optional exact email-domain allowlist for first-time account creation. Every configured admission allowlist must match. |
| `groupClaim` / `allowedGroups` | Optional provider claim and allowed group values for first-time account creation. The claim defaults to `groups`; a string or array of strings is accepted. |
| `roleClaim` / `roleMappings` | Optional claim values mapped to `user` (SeerrNG's normal default permissions) or `admin`. String and string-array claims are supported. |
| `logo` | Optional provider mark configured by an administrator; the catalog ID remains presentation metadata. |

`allowedEmailDomains` and `allowedGroups` are optional. If neither is set,
`newUserLogin: true` retains the existing behavior for any verified email. If
both are set, the email must match one exact domain and the provider claim must
contain at least one listed group. Domain matching is case-insensitive and does
not include subdomains unless each subdomain is listed explicitly. An empty or
malformed allowlist denies new account creation.

Role mappings are also optional. An exact matching `admin` value grants
SeerrNG's administrator permission; `user` uses the configured
`main.defaultPermissions`. Unmapped values receive normal user permissions.
When mappings are configured, subsequent OIDC sign-ins apply the mapped role
to that linked account. Linking a provider from an already signed-in account
does not change permissions until its next OIDC sign-in. Keep the role claim
and mapping values aligned with claims emitted by the configured issuer.

## Register exact callback URLs

For ordinary OIDC providers, SeerrNG uses the exact page URL from which the
user started sign-in as the provider's `redirect_uri`. Register both of these
URLs for each ordinary provider so that login and account linking can use the
same client:

```text
https://requests.example.com/login
https://requests.example.com/profile/settings/linked-accounts
```

Replace the origin with SeerrNG's configured public **Application URL**. The
provider returns to that page; SeerrNG then posts the authorization response
to its server-side callback route. The paths above are the exact paths the
current flow constructs. If a reverse proxy rewrites a base path, confirm the
`redirect_uri` in SeerrNG's authorization request and register that exact
external URL; do not add a prefix or wildcard by assumption.

Sign in with Apple uses a fixed callback instead:

```text
https://requests.example.com/api/v1/auth/oidc/callback/<provider-slug>
```

Register the exact configured provider slug in place of `<provider-slug>`. Do
not register `/*` or an entire host as an allowed redirect. A narrow callback
list protects authorization codes and makes reverse-proxy mistakes visible.

## Provider setup

The same setup sequence applies to the providers in the
[provider catalog](../../../maintainers/oidc-provider-catalog.md):

1. Create an OIDC/OAuth Web Application or confidential client and enable
   Authorization Code flow. Use PKCE S256 where the provider supports it.
2. Copy the provider's exact issuer identifier from its discovery metadata.
   Tenant-specific services such as Entra, Okta, Cognito, PingOne, and
   self-hosted Keycloak/authentik must use the intended tenant, realm, or
   environment.
3. Register the exact URLs above and confirm the provider can return an email
   claim. Keep SeerrNG's `scopes` broad enough for `email`.
4. Copy the client ID and secret into the protected `settings.json` volume.
5. Start with `newUserLogin: false` unless the provider should create accounts
   for people who do not yet have a SeerrNG user.
6. Save and apply the config using the deployment's normal SeerrNG settings
   procedure, then test from the public HTTPS URL.

SeerrNG recognizes `google`, `microsoft-entra`, `okta`, `auth0`, `keycloak`,
`authentik`, `zitadel`, `amazon-cognito`, `gitlab`, `fusionauth`, `onelogin`,
`pingone`, `jumpcloud`, and `apple-sign-in`. Other providers can use any stable
slug and receive generic OIDC branding. Each login label and local mark is
presentation only; discovery and issuer validation always use `issuerUrl`.

## Account admission and linking

The provider must return a non-empty subject (`sub`) and a verified email.
SeerrNG accepts `email_verified` only when it is the boolean `true` or the
exact string `"true"`. New-user login must be enabled on that provider before
an unknown identity can create a user. The email must not already belong to
another SeerrNG account; OIDC does not silently attach an identity to an
existing user because their email strings match.

Existing users should sign in locally, open **Profile → Settings → Linked
Accounts**, and explicitly link the provider there. Users can unlink it from
the same page. Provider claims do not assign SeerrNG permissions unless the
administrator configures `roleClaim` and `roleMappings`. Review role mappings
and new users using SeerrNG's normal user-management tools.

## Protocol and network behavior

- Ordinary providers use Authorization Code with PKCE S256, one-time state,
  nonce, and a short-lived signed `HttpOnly` correlation cookie. Each attempt
  gets its own cookie; SeerrNG keeps at most eight pending browser attempts.
- The callback checks the transaction and provider configuration before code
  exchange, validates the provider ID token, and restricts the final `returnTo`
  value to a local SeerrNG path.
- Provider discovery and token/user-info calls run server-side with bounded
  requests. Server-side OIDC requests to loopback, private, link-local, and
  reserved addresses are blocked by default.
- For an intentionally internal identity provider, set
  `OIDC_ALLOW_PRIVATE_ADDRESSES=true` in the SeerrNG process environment. This
  separately permits internal provider endpoints; only use it with trusted
  issuer settings.
- HTTPS is required by default for provider endpoints. Set
  `OIDC_ALLOW_INSECURE=true` only when a trusted provider intentionally needs
  HTTP. This opt-in is separate from the private-address setting.
- An OIDC login establishes a SeerrNG session. Signing out of SeerrNG clears
  the app session; it does not promise to end the identity provider's global
  SSO session.

## Sign in with Apple

Create a Sign in with Apple Services ID, enable Sign in with Apple, and
register the fixed callback URI from above as a Return URL. Set `issuerUrl` to
exactly `https://appleid.apple.com`, use the Services ID as `clientId`, and
store Apple's signed client-secret JWT in `clientSecret`. SeerrNG automatically
requests only `openid email`, uses `response_mode=form_post`, and omits PKCE
for Apple's documented web flow. Do not add `profile` to the scopes.

Apple's signed client-secret JWT has a maximum six-month lifetime; rotate it
before expiry and update the protected settings. Apple may send
`email_verified` as a boolean or the exact string `"true"`; only an affirmative
value is accepted. See Apple's [environment setup](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple),
[web authorization](https://developer.apple.com/documentation/signinwithapple/incorporating-sign-in-with-apple-into-other-platforms),
and [client-secret creation](https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret).

## Verify and recover

### Upgrade from provider-slug identity links

Older SeerrNG builds stored an OIDC link as provider slug plus subject and did
not persist the issuer that authenticated it. The issuer-binding migration
leaves those rows unbound and rejects them for sign-in rather than guessing an
issuer from the provider's current settings. Before upgrading, make sure each
OIDC-only user has a working local or media-server recovery path. After the
upgrade, sign in through that path and explicitly link the current provider
again from **Profile → Settings → Linked Accounts**. If an account has no other
working sign-in, an administrator must restore local access before it can be
linked again.

1. Open `/login` and confirm the provider label, local mark, and help link are
   correct. Also confirm linked-account sign-in is available to an existing
   user where appropriate.
2. Complete sign-in with a verified account and check the expected SeerrNG
   user and permissions.
3. Try a verified address that should not be admitted and confirm the app
   rejects it. Test a first-time account with `newUserLogin` both disabled and
   enabled in a non-production environment.
4. Confirm local or media-server login still works before relying on OIDC as
   the only sign-in route.

To disable OIDC, set `main.oidcLogin` to `false` or remove the provider entries
and apply the config. Existing SeerrNG users and linked-account records are
not a substitute for a provider registration; retain a local recovery
administrator before changing provider configuration.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Provider reports an invalid redirect | Ensure the exact `/login` or linked-account page URL is registered for ordinary sign-in, or the exact slug-specific API callback for Apple. Check the public Application URL and reverse-proxy base path. Remove wildcard redirect entries. |
| SeerrNG cannot discover the provider | Compare `issuerUrl` exactly with the discovery document's `issuer`; check the tenant/realm path, DNS, CA trust, and outbound network. Enable private addresses or HTTP only for an intentional trusted internal IdP. |
| Callback fails after provider sign-in | Start a new attempt on the same public hostname. Check the forwarded HTTPS scheme and host, browser cookies, app Application URL, and whether a restart/config change invalidated the pending transaction. |
| User is denied after a valid provider login | Confirm `sub`, `email`, and affirmative `email_verified`; keep the `email` scope and check `newUserLogin`. If the email already belongs to an account, link it from that account instead of expecting automatic linking. |
| Provider button does not appear | Confirm `main.oidcLogin` is true and at least one provider has a valid stable slug, name, issuer, client ID, and secret. |
| Apple works in discovery but fails at callback | Check the Services ID, signed client-secret JWT, fixed callback path, HTTPS origin, `openid email` scopes, and form-post cookie behavior. |

Use SeerrNG's server log error code and timestamp when investigating a failed
attempt. Do not share client secrets, authorization codes, token payloads, raw
claims, or complete callback URLs that contain query parameters.
