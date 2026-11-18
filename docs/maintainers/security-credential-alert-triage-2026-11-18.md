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

## Slack action callbacks

Dismissed alert 627 after tracing the callback from the signature and
workspace checks to the outbound request. The callback requires HTTPS,
the exact Slack webhook host, and an actions path. It rejects credentials
and custom ports, validates the address on a direct connection, and
disables redirects.

## Swipe AI ranking

Dismissed alert 626 after tracing the provider destination to persisted
administrator settings and the administrator-only connection test.
Member requests use the configured endpoint. Local inference servers
are supported, and the runtime refuses redirects. All 13 focused
ranking and settings tests passed, including the redirect check.

## Configurable notification destinations

Dismissed alerts 622–625 for Discord, Gotify, ntfy, and Slack.
Saving and testing each destination requires administrator permission.
The agents validate the URL and share request options that enforce
guarded DNS on direct connections and reject cross-origin redirects.
Private addresses require the operator's explicit environment opt-in.
All 57 focused notification and security tests passed.

## Jellystat and Audiobookshelf service destinations

Dismissed alerts 612 and 614. Administrator permissions guard both
service configuration and connection tests. The consumers use their
configured service roots and scoped API paths. Both clients validate
the URL and disable redirects before sending authentication headers.
Private hosts are supported for self-hosted services. All 12 focused
client and settings tests passed.

## Bindery, Kavita, Navidrome, slskdN, and Tunerr destinations

Dismissed alerts 613 and 615–621. Service settings and connection tests
require administrator permission. Runtime calls use the configured service
addresses and scoped API operations. Tunerr also supports a separately
configured guide URL and adds no deck credentials to that request. All
five clients validate the destination and disable redirects. The 31
focused Bindery, Kavita, and Navidrome tests passed.

## Image proxy destinations

For alert 312, image proxies with a configured base now restrict initial
requests to that origin. The private media-server avatar proxy also
rejects cross-origin redirects. Remote Plex avatars continue to use
their separate URL validation and cache path. All 52 focused image
proxy tests passed. The historical code-scanning alert remains open.

## Open findings with fixes on main

GitHub still lists these findings against older analyzed revisions.

| Alerts | Fix on main | Verification |
| --- | --- | --- |
| 647 | `b918a42ba` decodes ComicVine entities once | Lumen production build and seven browser checks |
| 653 | `022c66b66` and `cc541a5c5` encrypt OIDC correlation state and require a full authentication tag | 156 authentication tests and staged scan |
| 611 | `a97bd3203` removes the nested repetition from API catalog scanning | Both catalog source tests and regenerated catalog checks |
| 662 | `b3a87a7db` validates both the shared cover and request-card fill | Production build and 48 browser checks |
| 669, 667, 666, 690 | `2b074db5f` validates raw same-origin artwork paths, including the shared book cover helper | Production build and 28 Swipe and curated collection browser checks |
| 663, 691, 692 | `153349b31` validates artwork at shared detail and extra-category render points | Production build and 40 browser checks |

Dismissed alert 648 after tracing the ComicVine description formatter
to its sole consumer. Lumen renders the resulting strings as React
paragraph text.

## Image cache filesystem paths

Cache reads now check directory components before scanning entries or
opening files for buffered or streamed responses. The existing
descriptor checks still reject symlinks at the file itself and reject
non-regular or multiply linked files. The stale-entry pruner enumerates
directory names and checks each entry with lstat before descending.
All 53 focused image proxy tests passed.

Reviewed nine Semgrep matches for cache path joins and resolution. The
five affected callsites use cache-root containment, a checked filename
basename, or names supplied directly by filesystem enumeration. Added
rule-specific explanations at those callsites. The targeted Semgrep
scan returned zero unsuppressed findings.

### Public image socket lookup

Public image proxies now require a direct connection so the validated
lookup is used by the socket on every request and redirect. An outbound
forward proxy cannot perform its own resolution for these image requests.
Private media-server avatar fetching retains its configured-origin and
same-origin redirect policy. All 109 focused image proxy, avatar proxy,
and URL security tests passed. GitHub alert 312 still shows the historical
analysis.

### Shared image build and scanner caches

The 21 open cache-poisoning alerts reference CI commit `6fa6f964b`, an
ancestor of `d43b04897`. The latter removed shared BuildKit cache inputs
from main and release publishing and shared database caches from their
Trivy jobs. The preview publisher and standalone Trivy scanner now use
the same cache isolation. All 49 release-workflow tests passed. The
historical GitHub findings remain open.
