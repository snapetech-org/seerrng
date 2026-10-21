# OIDC provider catalog

This is the human-readable provider setup index for the OIDC provider IDs used
by the SnapeTech applications. The adjacent
[`oidc-provider-catalog.json`](./oidc-provider-catalog.json) is the
machine-readable source for app menus and provider-presentation tests. Provider
IDs select the local login label, bundled mark, and setup link. They never
select the issuer, discovery endpoint, client credentials, or token-validation
rules.

All providers must be configured with the exact issuer identifier published
in their OpenID Provider metadata and the exact callback URI from the
application's guide. Examples below are issuer examples, not copy-and-paste
substitutes for the provider's metadata. The standard requested scopes are
`openid profile email`; a provider must return the verified email claim required
by the app's admission policy. A provider that cannot supply that claim may
not satisfy an app's sign-in requirements.

| ID | Provider | Example issuer | Default scopes | Official setup guide and notes |
| --- | --- | --- | --- | --- |
| `generic` | OpenID Connect | `https://id.example.com/realms/example` | `openid profile email` | [OpenID Foundation overview](https://openid.net/developers/how-connect-works/). Use the exact `issuer` value from discovery metadata and confirm that the provider supports the app's required claims. |
| `google` | Google | `https://accounts.google.com` | `openid profile email` | [OpenID Connect guide](https://developers.google.com/identity/openid-connect/openid-connect). Register a Web application OAuth client and the exact callback URI. |
| `microsoft-entra` | Microsoft Entra ID | `https://login.microsoftonline.com/<tenant-id>/v2.0` | `openid profile email` | [OpenID Connect protocol](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc). Choose the intended tenant/account audience, use its concrete issuer, and register the exact Web callback. Claim availability depends on tenant and app registration. |
| `okta` | Okta | `https://<your-okta-domain>/oauth2/default` | `openid profile email` | [Authorization Code flow](https://developer.okta.com/docs/guides/implement-grant-type/-/main/). Create an OIDC Web Application integration and use the issuer for the intended authorization server. |
| `auth0` | Auth0 | `https://<tenant>.<region>.auth0.com/` | `openid profile email` | [Authorization Code flow](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow). Add the exact callback to Allowed Callback URLs; custom domains must match the configured issuer. |
| `keycloak` | Keycloak | `https://<host>/realms/<realm>` | `openid profile email` | [Server administration guide](https://www.keycloak.org/docs/latest/server_admin/). Create an OpenID Connect client and keep redirect URI matching narrow; do not use wildcard redirects. |
| `authentik` | authentik | `https://<host>/application/o/<application-slug>/` | `openid profile email` | [Create an OAuth2/OpenID Provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/create-oauth2-provider/). Configure strict redirect matching and make `email` and `email_verified` available. |
| `zitadel` | ZITADEL | `https://<instance>.zitadel.cloud` | `openid profile email` | [Recommended OIDC flows](https://zitadel.com/docs/guides/integrate/login/oidc/oauth-recommended-flows). Enable the needed claims in the ID token or UserInfo and register the exact callback. |
| `amazon-cognito` | Amazon Cognito | `https://issuer-cognito-idp.<region>.amazonaws.com/<user-pool-id>` | `openid profile email` | [Federation endpoints](https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html). Use the user-pool issuer and configure the exact callback on the app client. Claim availability depends on pool attributes and scopes. |
| `gitlab` | GitLab | `https://gitlab.com` | `openid profile email` | [GitLab as an OpenID Connect provider](https://docs.gitlab.com/integration/openid_connect_provider/). Create an OAuth application with the `openid` scope; for self-managed GitLab, use that instance's issuer. GitLab returns `email` and `email_verified` only when the app has the `email` scope and the user has a public email address. |
| `fusionauth` | FusionAuth | `https://<fusionauth-host>` | `openid profile email` | [OAuth application guide](https://fusionauth.io/docs/lifecycle/authenticate-users/oauth/). Configure the exact authorized redirect and use discovery metadata for the intended tenant. |
| `onelogin` | OneLogin | `https://<subdomain>.onelogin.com/oidc/2` | `openid profile email` | [Connect to OneLogin](https://developers.onelogin.com/docs/openid-connect/connect-to-onelogin/). Assign the OIDC app to intended users and check the tenant metadata for available scopes and claims. |
| `pingone` | PingOne | `https://auth.pingone.<region>/<environment-id>` | `openid profile email` | [Edit a PingOne OIDC application](https://docs.pingidentity.com/pingone/applications/p1_edit_application_oidc.html). Create an OIDC Web App, enable Authorization Code, add the exact callback, and use the environment's issuer. |
| `jumpcloud` | JumpCloud | `https://oauth.id.jumpcloud.com/` | `openid profile email` | [SSO with OIDC](https://jumpcloud.com/support/sso-with-oidc). Create a Custom OIDC App and use the issuer for the correct region (US, EU, or India). |
| `apple-sign-in` | Sign in with Apple | `https://appleid.apple.com` | `openid email` | [Configure the environment](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple) and [web authorization](https://developer.apple.com/documentation/signinwithapple/incorporating-sign-in-with-apple-into-other-platforms). Apple is a special web flow: `form_post`, signed client-secret JWT, no `profile`, and no PKCE. Rotate the JWT before its six-month maximum lifetime. |

## Provider registration checklist

1. Create a Web or confidential client for the application. Use Authorization
   Code flow and enable PKCE S256 where the provider supports it.
2. Copy the exact issuer identifier from the provider's discovery metadata.
   Do not append `/.well-known/openid-configuration` to the issuer setting.
3. Register only the exact callback URI shown in the app-specific guide. Include
   the public HTTPS scheme, host, port if nonstandard, and reverse-proxy base
   path. Do not use `/*` or another broad wildcard.
4. Request the scopes required by that provider and app. Confirm that a sign-in
   returns a non-empty subject, email, and affirmative `email_verified` claim.
5. Store the client secret in the app's server-side configuration or secret
   store. Do not commit it, add it to client-side settings, or paste it into a
   support bundle.
6. Apply an explicit user or domain allow-list before exposing the login
   button. Provider-side application assignment is useful defense in depth; it
   does not replace the app's admission policy.
7. Test one permitted account and one denied account using the public URL.
   Keep the app's local or other existing recovery method available.

## Branding and icon assets

Applications bundle their provider marks locally so sign-in does not depend on
a third-party icon host. The icon sprite paths are adapted from
[Simple Icons](https://github.com/simple-icons/simple-icons). Simple Icons'
[disclaimer](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md)
explains that its license does not grant trademark rights. Provider names,
marks, and setup pages belong to their respective providers. SeerrNG's
multi-provider configuration can also retain its existing administrator-set
display name and optional logo; the provider slug remains stable, and the
configured issuer remains authoritative.

Unknown provider IDs must render the generic OpenID Connect label, icon, and
help page. A new provider is not ready for release until its ID, official setup
URL, issuer guidance, scope/claim caveats, local icon mapping, and presentation
tests have been reviewed together. Never infer trust or authorization from a
provider icon, label, domain name, or group claim.
