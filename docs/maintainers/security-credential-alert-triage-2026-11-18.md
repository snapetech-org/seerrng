# Password hashing and session cookie alert triage, 2026-11-18

Dismissed CodeQL alerts 635–643 as false positives after tracing the
flagged SHA-256 digests to their consumers. They identify cache and
single-flight entries, discovery revisions, provider rate-limit buckets,
and requester-scoped idempotency keys. They do not verify passwords.
Local account password storage and verification use bcrypt in
`server/entity/User.ts` and `server/lib/passwordVerification.ts`.

Dismissed alerts 628–634 as false positives. They concern cookies issued
by isolated Supertest or loopback-only Express applications. The server
build excludes those test files. No production cookie configuration
was changed.

Verified that neither rule has any open alerts. CodeQL remains disabled
under the owner directive.

## Token validation and storage

Dismissed alerts 659–661 after confirming that the session middleware
instances belong to Express fixtures excluded from the server build.
Dismissed alert 652 because the locale cookie stores only a validated
display language. Alert 653 concerns the production OIDC correlation cookie. Newly issued
cookies encrypt the correlation payload with AES-256-GCM and expire after
ten minutes on both the client and server. Existing signed cookies can
finish an in-flight login within the same lifetime. The alert is still
open in GitHub.

## Markup handling

Dismissed alerts 644, 645, and 651 after verifying that the expressions
inspect checked-in source in test assertions and never render the
results as markup.

Dismissed alerts 649 and 650 after tracing AniList work descriptions
through the comic work JSON response to React paragraph text in Lumen.
The regular expressions format descriptions for display. Native
ComicVine detail descriptions pass through the API adapter's DOMPurify
allowlist before the separate native markup renderer uses them.
Dismissed alert 646 after tracing the Visual Lab iframe document to
checked-in templates. The expression protects authored script blocks
from localization changes and restores them afterward. Localized text
and attributes are HTML-escaped before insertion.
