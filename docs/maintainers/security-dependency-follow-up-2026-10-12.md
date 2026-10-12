# Security tooling replacements — 2026-10-12

This follow-up supersedes the reachability findings in
`security-dependency-follow-up-2026-10-07.md`. The historical report remains
unchanged.

## Advisory findings addressed

- [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
  marks every `braces` version through 3.0.3 vulnerable and currently lists no
  patched version. The affected lockfile graphs no longer contain `braces`;
  the Docusaurus glob callers now use `tinyglobby` and `picomatch`, while the
  application tooling packages that introduced the other paths were removed.
- [GHSA-ch52-4w7c-c8xp / CVE-2026-93748](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
  marks `http-cache-semantics` through 4.2.0 vulnerable and currently lists no
  patched version. Its docs-only path came from Docusaurus Core's optional
  update notifier. Removing that notifier removes `http-cache-semantics` from
  the docs graph while preserving Docusaurus's Node-version check.

These are dependency-removal mitigations, not claims that either upstream
advisory has a fixed release. Lockfiles and reachability were checked after the
replacements below.

Both advisories are publicly disputed by their package maintainers. The `braces`
maintainer argues that the reported recursion case is bounded by the parser's
input-length limit and that untrusted callers should not supply glob patterns
([issue #84](https://github.com/micromatch/braces/issues/84)). The
`http-cache-semantics` maintainer argues that `Set-Cookie` does not itself
prohibit shared caching under [RFC 9111 §7.3](https://www.rfc-editor.org/rfc/rfc9111.html#section-7.3)
and that `Cache-Control: private` controls cross-user reuse ([issue #56](https://github.com/kornelski/http-cache-semantics/issues/56)).
GitHub still lists both advisories as high severity and does not mark a patched
version. [`http-cache-semantics` 4.3.0 was published on npm on October 4](https://www.npmjs.com/package/http-cache-semantics?activeTab=versions),
but the advisory still does not identify it as a fix, and this review did not
verify that it changes the disputed behavior. Removing the packages clears
SeerrNG's dependency exposure without claiming the disputed exploit scenarios
are independently confirmed.

The docs lockfile audit also found `joi@17.13.7` through Docusaurus Utils
Validation, from workspace override `joi: 17.13.7`. GitHub advisory
[GHSA-wr44-6hxh-3jwq / CVE-2026-90771](https://github.com/advisories/GHSA-wr44-6hxh-3jwq)
lists `17.13.8` as patched. The docs override now selects `17.13.8`.

## GitHub alert review

On 2026-10-12, GitHub listed Dependabot alert #285 for `braces` and #286 for
`http-cache-semantics` as dismissed with reason `tolerable_risk`. Both point to
`gen-docs/pnpm-lock.yaml`. This change removes those packages from the resolved
graphs instead of relying on the dismissals. The same read-only API review
found no open Dependabot alerts, Code Scanning alerts, pull requests, or issues.
GitHub still needs to rescan the pushed main branch before the alert state can
reflect the dependency removals.

## Replacements

- Oxlint now runs the Next.js lint rules; the `no-location-assign-relative-
  destination` check stays in the local ESLint plugin so that redirect check is
  retained without bringing back the vulnerable `fast-glob` dependency path.
- The only configured FormatJS lint rule, `formatjs/no-offset`, is implemented
  locally over `@formatjs/icu-messageformat-parser`; the FormatJS ESLint plugin
  and its optional Jest transformer peer are removed.
- The Commitizen prompt is replaced by the local Conventional Commit prompt in
  `scripts/commit-message-prompt.mjs`.
- Nodemon is replaced by `scripts/dev-server.mjs` with Chokidar 5. The server
  entry point and `.ts`, `.json`, and `.yml` restart filter are retained.
- Docusaurus Utils 3.10.1 and 3.10.2 are patched to use picomatch and
  tinyglobby. Docusaurus Core 3.10.1 and 3.10.2 have the optional network update
  notice removed. Chokidar 3 is overridden with Chokidar 4 in the docs graph.
- `http-proxy-middleware` 2.0.10's glob matcher is patched to use picomatch;
  the API keeps string and array path filters.
- The docs workspace `.pnpmfile.cjs` narrows dependency rewrites to the exact
  upstream package versions listed above. Regression tests cover those version
  conditions and ensure unrelated manifests are unchanged.

## Dependency graph evidence

- The root `pnpm-lock.yaml` was regenerated with Node 24.20.0 and pnpm 10.24.0.
  It contains no `braces@3.0.3`, `http-cache-semantics@4.2.0`, Nodemon,
  Commitizen, Next ESLint plugin, FormatJS ESLint plugin, or `tsc-alias` entry.
- The docs lockfile was regenerated after correcting the patch diffs and the Joi
  override. It contains no `braces` or `http-cache-semantics` package or
  snapshot keys and resolves patched Joi 17.13.8.
- Read-only `pnpm audit --json` with Node 24.20.0 and pnpm 10.24.0 reported no
  advisories in the root or docs workspace lockfiles after the Joi update. The
  first docs scan found only Joi 17.13.7; the refreshed lock now resolves Joi
  17.13.8 for Docusaurus Utils Validation 3.10.1 and 3.10.2.
- The root `node_modules` tree was not reinstalled. Its `pnpm why braces`
  output still reflects the old graph, so it is not evidence about the new
  root lockfile; the lockfile and audit results are the evidence here.

## Verification still required

No application tests, docs build, or cumulative validation were run on the
local workstation. The authorized `kspls0` control profile currently permits
read-only commands only and denies package and filesystem operations. Install,
the docs build, focused tooling checks, and `pnpm validate:development` remain
release gates on `kspls0`.

The root lockfile resolution also reported existing peer warnings for ESLint
10 with `eslint-plugin-jsx-a11y` and `eslint-plugin-react`, and React 19 with
`react-popper` and `react-use-clipboard`. They are outside these dependency
replacements and must be checked against the exact validation candidate.
