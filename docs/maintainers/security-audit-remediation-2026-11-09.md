# November 9 security audit remediation

The original review examined `9c8e2cb8e5f90efb9247ca9223e8657822ca8814`.
Implementation started from `cb9b89860e8c6aa088df081b90bac416794bc1d8`
and preserves subsequent main-branch work. This record maps all 23 reported
findings to changes, operational actions and verification limits. SNG-04 was
withdrawn in the original audit; its form-login negative control remains tested.

| Finding | Remediation |
| --- | --- |
| SNG-01 | Reject blocked local-account guesses before password hashing. Preserve the fixed cooldown and recovery path. Account attempts remain serialized. |
| SNG-02 | Migration 0013 preserves an explicit CSRF opt-in. |
| SNG-03 | Migration 0015 preserves HTTP-authentication choices and no longer fabricates acknowledgement from TLS mode. |
| SNG-05 | Only the exact OIDC form-post callback bypasses browser CSRF. Its existing state, nonce, correlation-cookie and provider checks still apply. |
| SNG-06 | Trust configured proxy addresses/CIDRs instead of a hop count; reject Internet-wide trust. Default to loopback; use Cloudron's supplied proxy address when applicable. |
| SNG-07 | Count an HTTP request once across nested authentication guards. |
| SNG-08 | Shared response category enforcement, helper route guards, pre-mapping adult metadata checks and resolver rating checks cover cross-media helpers. AniList records retain adult metadata until policy evaluation. |
| SNG-09 | Playback, watched-status and collection operations enforce current category and maturity rules, including known IDs. Missing protected rating evidence fails closed. |
| SNG-10 | Revalidate the live session, account credentials and Jellyfin authority under the final handoff lock after provider work; logout participates in that lock. |
| SNG-11 | Shared follow admission serializes the 200-item quota, rechecks current request/category permissions and permits idempotent updates at capacity. Shared collector radar changes require request-management permission. |
| SNG-12 | Android image delivery checks the active WebView, complete configured origin and exact share path, then repeats origin/path checks inside the executing document. |
| SNG-13 | Android and iOS show the current origin, compare scheme/host/effective port and send external user-clicked links through existing external-navigation controls. Native rendered comparisons and their verification limits are recorded below. |
| SNG-14 | Live downloads reload session/key authority and current permissions before every frame and heartbeat. Revocation or administrator demotion closes the stream. |
| SNG-15 | Coalesce one pending update batch, bound frames/buffer length, and close a stream as soon as its writable buffer rejects more data. |
| SNG-16 | Admit image work before body buffering: two global jobs, one per user, 50 per-user/500 global attempts per UTC day. Decode at most four million pixels; bound OCR threads, time and output; bound external response tokens and time. |
| SNG-17 | Add hashed, expiring, per-user client tokens with exact discover/request scopes, independent revocation, a ten-unexpired-token limit and credential-version invalidation. Management requires an interactive session. Profile → Settings → Client Tokens provides creation, one-time copying and confirmed revocation. Publish extension migration instructions. |
| SNG-18 | Use the existing TLS-aware healthcheck for startup, readiness and liveness. Expose HTTPS and configurable ingress/Gateway backend ports. Preserve certificate verification. |
| SNG-19 | **Accepted by the owner: main remains unprotected.** No protection or ruleset changes are part of this work. |
| SNG-20 | Run Semgrep, Trivy and focused security regressions on PRs/main. Missing scanners and actionable findings fail. Accepted Semgrep matches are bound to exact file hashes, rules and counts, with owner/reason/expiry. |
| SNG-21 | Remove the tracked JVM crash dump, ignore future crash/heap dumps and reject tracked dumps in CI. No active credential was established in the original dump; this is a current-tree cleanup, not a rewrite of published history. |
| SNG-22 | Production script CSP is `script-src 'self'`; development-only exceptions remain confined to development. Browser regression tests exercise both shipped frontends and prove injected inline code is blocked. |
| SNG-23 | Validate curated links as internal paths, including decoded/backslash variants, and sanitize legacy stored external links on read. Recheck curation permission at persistence. |
| SNG-24 | Restrict shared narrator preferences to current request managers; check audio category and service identity at mutation. The existing collection button follows that permission. |

## Operator actions

- Set `SEERR_TRUSTED_PROXIES` to the actual proxy peers if they are not loopback.
  Do not put client networks in this list. Cloudron's documented
  [`CLOUDRON_PROXY_IP`](https://docs.cloudron.io/packaging/cheat-sheet/#environment-variables)
  is the fallback when no explicit list is supplied. Direct connections no
  longer gain trusted identity/protocol from a forged forwarding header.
- Review existing CSRF and HTTP-authentication settings. Old migrations may
  already have overwritten them; source code cannot reconstruct prior choices
  or consent. The correction prevents future overwrites and preserves current
  explicit choices rather than guessing an operator's earlier intent.
- Replace extension owner keys with scoped tokens and rotate previously shared
  owner credentials. The legacy service key remains available for server-side
  integrations; revoking it automatically would break their connections.
  See the [extension guide](../using-seerr/browser-extension.md).
- For native Kubernetes TLS, match `service.httpsPort` to the application's
  configured listener. Set `ingress.backendPort` or `route.main.backendPort`
  to that port and configure your controller's HTTPS upstream certificate trust
  (or Gateway `BackendTLSPolicy`). For TLS termination at the proxy, retain the
  HTTP backend and explicitly trust that proxy. Probes load the application's
  TLS mode/CA settings and contact the local readiness endpoint directly.
- Recognition budgets are process-local admission limits, not a durable billing
  ledger. Restart resets daily counters. Configure provider-side spending limits
  when using a paid external provider; external recognition still requires the
  administrator's existing consent setting.

## Scanner review and validation

Semgrep CE 1.184.0 scans current community rules. The initial scan reported 54
matches across 31 file/rule pairs. These were reviewed as existing audit
hotspots, provenance scripts or guarded operations; their exact-file exceptions
are in `config/security/semgrep-reviewed.json`, owned by SeerrNG maintainers and
expiring February 7, 2027. A changed file, additional match, new rule or expired
exception fails `scripts/check-semgrep-baseline.mjs`. Reports retain parser and
engine warnings (notably template YAML and embedded workflow shell); a passing
gate does not imply complete parser coverage. No directory-wide baseline or
silent report-only success is used for findings.

Trivy 0.76.2 checks vulnerabilities, configuration and secrets at HIGH/CRITICAL
severity, with fixable vulnerability gating. Its sole initial warning was the
Cloudron bootstrap USER directive. The narrowly annotated exception is backed
by tests that require group/UID/GID privilege dropping before application code
loads and reject setup failures and storage symlinks. The annotation is also
covered by the expiring Semgrep file-hash review. Other findings fail the scan.

Local validation includes the original audit regressions, account/key revocation
and scope tests, shared quota races, serialization safety, content/maturity
admission, image decoding limits, SQLite migration up/down and ownership,
PostgreSQL schema alignment, TLS-aware probe status checks, chart rendering,
scanner gate rejection tests, typechecking, production builds and lint.
The session replay test uses a dedicated HTTP client so server restart testing
does not inherit a stale global fetch connection pool.

Production browser verification covers `/login` and `/lumen/login` at 390×900
and 1440×900: form hydration, rejected credential feedback, no horizontal
overflow, self-only script CSP and blocked inline injection. All four cases
passed using Chromium. Generated production HTML also contains no executable
inline scripts. CI retains screenshots and failure traces for this suite.

## Verification exclusions

External identity/media providers were mocked; no live provider credentials or
production user data were used. PostgreSQL integration and Android/iOS rendered
comparisons have passed on GitHub-hosted runners. Physical devices, signed store
releases and live external sign-in providers were not exercised.
Main branch protection is intentionally excluded by the owner's instruction.

### Web narrator visual acceptance addendum

The narrator-planner permission states above have now received matched production
browser comparison: Orig/John, 390/1440, administrator and advanced-request-only
accounts, plus failed-load/Retry states (24 captures across baseline/candidate).
Panel geometry is preserved, managers retain the action, advanced-only accounts
lose it and receive 403 from the real endpoint. The long phone heading now uses
the existing shared truncation span. Details and retained evidence are in the
[November 9 QA journal](20261109-lumen-upgrade-and-storage-qa.md). This supersedes
the narrator web-visual exclusion. Native comparison results are recorded below.

### Token-management and database verification continuation

The scoped-token settings flow completes SNG-17 without sharing the legacy
owner key. It uses the existing profile tabs, form fields, status, sensitive
input, card and action components. Tokens are held only in the component's
one-time display state, cleared on account changes, excluded from the SWR cache
and absent from browser storage. Failed creation retains the draft; failed list
refresh cannot discard the only copy of a new token. Revocation requires explicit
confirmation and immediately invalidates the credential. New UI adds no page
CSS or Tailwind utilities; existing semantic owners retain their styling.

Production Chromium verification passed all 23 cases on integrated
`d06af0e2589c3179bf3cee963160e50cc1387f07` plus this continuation:

- `/profile/settings/client-tokens`: PersiusNG, SeerrOrig and SeerrNGJ at
  390×900 and 1440×900; empty, creation failure, one-time masked token,
  reload, cancel revocation and confirmed revocation. Read failure/Retry was
  also exercised on the phone layout. All six layouts were visually inspected,
  including the token card centered above fixed phone navigation.
- `/profile/settings/password`: matching existing shared-consumer captures on
  baseline `f6e9cffb2ffd86e3b00f9e832f0afb3321084c08` and candidate.
  The new navigation item is intentional; shared controls retain their geometry.
- An ordinary fixture account creates its own token; even an administrator
  cannot list or revoke that other account's token through this own-account API.
  Client keys cannot reach server settings, list responses are `no-store`,
  plaintext is absent from storage/list responses, and revoked keys return 401.
  The existing service worker excludes authentication routes from its cache
  allowlist and honors `no-store`; this policy was inspected separately.
- `/series/security-fixture`: all three themes and both widths, with and
  without request-management permission (12 cases). Provider reads and writes
  are mocked for presentation checks; real endpoint denial tests establish
  server authorization. The concurrent narrator heading fix is retained.
- `/login` and `/lumen/login`: both widths hydrate and reject inline script
  injection under production self-only script CSP (four cases).

The [PostgreSQL verification run](https://github.com/snapetech-org/seerrng/actions/runs/42703503483)
passed the real PostgreSQL 16 token migration/authentication test, 37 focused
security regressions and 39 deployment/scanner gate tests. The same checks
passed on integrated `d06af0e25` entity metadata and client-scope rules in
[run 42714291962](https://github.com/snapetech-org/seerrng/actions/runs/42714291962).
The PostgreSQL test creates and removes only a random test schema. It exercises
production entity metadata and migration SQL, hidden and unique token hashes,
UTC expiry round trips with a non-UTC database session, scope and expiry denial,
credential-version invalidation, deletion revocation, owner cascade and rollback.
Normal PostgreSQL CI and the security workflow now run it automatically.

Production builds, client/server typechecking, lint, formatting, the full
Vitest suite (5,295 passed; seven skips across 724 files), and the tooling suite
(408 passed; five skips) passed on `15134c7c7` plus this continuation.
After integrating `d06af0e25`, the production build and formatting passed again,
as did 59 focused token, request-intent, migration and service-worker regressions
and all 23 production browser cases. The six token-card layouts were reinspected.
No native production source changed in that integration. The PostgreSQL case
is intentionally skipped without its database and passed separately above.

The operator actions above remain deployment-specific. This change does not
claim to have rotated live keys, changed production proxy peers, reconstructed
past consent, or exercised external identity-provider accounts.

### iOS browser lifecycle correction discovered during native verification

The first real simulator comparison found an existing render feedback loop in
both historical and current iOS clients. `makeUIView`/`updateUIView`
synchronously called `WebViewState.refresh`, assigning `@Published`
properties even when unchanged. Opening a server repeatedly invalidated SwiftUI
while rendering; the UI became unresponsive and XCTest could not take a
snapshot. The original failed run is
[42703503082](https://github.com/snapetech-org/seerrng/actions/runs/42703503082).

The correction attaches the weak browser reference without publishing, delivers
initial/KVO state asynchronously, publishes only changed values, and ignores
callbacks from a previously selected browser. Two unit tests cover unchanged
publication and stale-browser isolation; all 12 candidate unit tests passed in
[42709701469](https://github.com/snapetech-org/seerrng/actions/runs/42709701469).
The workflow applies the same nonvisual lifecycle correction to the historical
comparison so it can render, retaining its original address label and navigation
policy. This is a qualified baseline, not a claim that the untouched historical
client passed.

The first rendered long-origin capture exposed another issue: the principal
navigation title could use its full intrinsic width and overlap both toolbar
buttons despite middle truncation. Its width is now bounded by the container,
with room reserved for the toolbar controls. The UI fixture checks the title's
actual frame stays between those controls and both controls remain hittable.
The full origin remains available to accessibility, while middle truncation
preserves the visible hostname suffix and port. The fixture uses a long
`.invalid` HTTPS address and verifies that the old HTTP warning disappears.

The initial iOS hyperlink fixture confirmed that cross-origin clicked links
require the external-navigation prompt, even when only the port changes.
The rendering fixture uses a page-initiated redirect to exercise an embedded
origin change; the user-link protection is unchanged.

### Scanner continuation

The full Semgrep scan retained the same 54 reviewed findings and passed the
hash/count/expiry gate, retaining 97 parser/engine diagnostics. A focused scan
of subsequently changed native files reported no production findings.
Explicitly including the normally excluded Android instrumentation fixture
reports its intentional unencrypted loopback `ServerSocket`; this fake server
runs only on the disposable emulator and handles no live credentials.

A focused scan of the 44 incoming integration files reported no production
matches or parser errors. Four test-only matches were throwaway Express session
secrets and a fixed-table-name SQL assertion regex; these files are already
excluded from the production scan by the existing test-fixture policy.
Trivy's HIGH/CRITICAL filesystem vulnerability, configuration and secret gate
passed using the previously downloaded database from this audit session.

### November 13 follow-up

The full local scan on the November 13 candidate reported 53 Semgrep matches.
Review confirmed the matches remain within the existing file-hash review set;
the two `unsafe-formatstring` matches in Migration 0007 were removed by keeping
the log message constant and writing administrator-controlled instance names
and provider errors as structured fields. The matching reviewed exception was
removed. The other reviewed matches remain scoped to exact file hashes, counts,
owners and expiry dates; they include path checks with containment and symlink
guards, escaped metadata regular expressions, administrator-validated email
links, a root bootstrap that drops privileges before application startup, and
archived audit evidence. They are not treated as application vulnerabilities
without an exploitable path through their current callers.

The Trivy CI-mode filesystem scan found no HIGH/CRITICAL vulnerabilities,
misconfigurations, or secrets in the scanned manifests and configuration. This
result applies to the candidate tree and scan configuration; it does not
replace exact-head GitHub checks or scans of published production images.

The final pinned Semgrep CE 1.184.0 run reported 51 findings. The checked-in
review baseline accepted all 51 with zero unreviewed, changed-hash, over-count,
or expired matches; 99 parser/engine diagnostics remain in the retained JSON
report. The final Trivy CI-mode scan reported zero HIGH/CRITICAL findings across
vulnerabilities, misconfigurations, and secrets. Both reports are retained
under `/mnt/disks/scratch/task-deliverables/seerrng-security-audit-20261113/`.

### Native rendered comparison results

Both [Android comparison jobs](https://github.com/snapetech-org/seerrng/actions/runs/42709114266)
passed on a Pixel 2/API 36 fixture, including a user-gesture sign-in popup.
All six retained 1080×1920 PNGs were compared: initial origin, popup origin and
changed main-window port. The main toolbar preserves the HTTP warning and uses
middle truncation; the popup toolbar shows its own loaded origin.

The changed-port load is initiated by instrumentation to exercise rendering;
ordinary cross-port HTTP navigation remains blocked. This does not establish
live external SSO compatibility. Screenshots use the instrumentation-only shell
bridge because Gradle removes app-owned files during test-app uninstall.
CI requires three nonempty PNGs per job and retains them for 14 days.

The [iOS baseline comparison](https://github.com/snapetech-org/seerrng/actions/runs/42713806657)
passed using the qualified historical baseline described above. Its three
1206×2622 captures were visually inspected alongside the corrected candidate.
The [final candidate verification](https://github.com/snapetech-org/seerrng/actions/runs/42724478543)
passed 12 unit tests and the three-state UI fixture on iPhone 17. Its initial
origin, page-initiated cross-port redirect and long HTTPS origin were visually
inspected. The displayed port follows the redirect, HTTP warnings remain on
HTTP pages and disappear for HTTPS, and the long title stays between the toolbar
buttons. This is fixture evidence, not live identity-provider certification.

The [source recovery verification](https://github.com/snapetech-org/seerrng/actions/runs/42718722185)
checked all 20 recovered implementation, test, workflow and documentation paths
against the tested source hashes, plus formatting, documentation links and the
feature inventory. Later main-branch packaging, documentation, Plex setup, API
cooldown, BookOrbit and TV-request work is preserved, including guide attribution
footers.

The [combined production verification](https://github.com/snapetech-org/seerrng/actions/runs/42723747031)
passed on `80cea98db` plus this continuation: canonical catalog generation,
formatting, feature-documentation checks, production builds, 490 regressions
across 11 test files and all 23 production browser cases. Later BookOrbit request
links and Lumen administration changes through `ad730dfe1` were reviewed and
preserved. Their four new English messages and source fingerprints remain intact;
only the 28 token-management messages are added by this continuation. The final
merge passed formatting and all prebuild checks, including 73 UI contract checks.

Implementation was committed directly to main in
[`6d7587bd`](https://github.com/snapetech-org/seerrng/commit/6d7587bd012905703452773c78df196681c67765).
All reported code remediations are implemented; SNG-04 remains withdrawn and
SNG-19 remains explicitly accepted. The operator actions and verification
exclusions above remain applicable.
