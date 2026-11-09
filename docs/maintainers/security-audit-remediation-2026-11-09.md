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
| SNG-13 | Android and iOS show the current origin, compare scheme/host/effective port and send external user-clicked links through existing external-navigation controls. Native visual acceptance remains unverified; see exclusions below. |
| SNG-14 | Live downloads reload session/key authority and current permissions before every frame and heartbeat. Revocation or administrator demotion closes the stream. |
| SNG-15 | Coalesce one pending update batch, bound frames/buffer length, and close a stream as soon as its writable buffer rejects more data. |
| SNG-16 | Admit image work before body buffering: two global jobs, one per user, 50 per-user/500 global attempts per UTC day. Decode at most four million pixels; bound OCR threads, time and output; bound external response tokens and time. |
| SNG-17 | Add hashed, expiring, per-user client tokens with exact discover/request scopes, independent revocation, a ten-active-token limit and credential-version invalidation. Token management requires an interactive session. Publish extension migration instructions. |
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
production user data were used. PostgreSQL integration needs its optional local
service. Linux cannot run Xcode or native device UI comparisons; Android unit
tests and unsigned client builds are configured on GitHub-hosted native runners.
Native origin-bar appearance and the narrator planner's permission states have
not received matching baseline/candidate visual comparison. Their visual
acceptance is **unverified and UI work is incomplete** until that comparison is
performed. This limitation does not relax server authorization checks or undo
the origin protections. Main branch protection is intentionally excluded by the
owner's instruction.
