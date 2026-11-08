# Verified CI tool download recovery — November 8

Application CI for `e5545e09a9f977a2209b4f8ea30530d1c2e9c238`, run
[42466801760](https://github.com/snapetech-org/seerrng/actions/runs/42466801760),
passed the native/application/browser/build/lint/type/tooling checks. Two jobs
failed before executing their checks: Lychee setup and Helm chart-testing's
cosign bootstrap received HTTP 504 from normal GitHub release URLs. The same
pinned assets were available through the official GitHub release-asset API.
GitHub release metadata confirmed the version, asset ID, size and digest.

The shared downloader tries the normal URL and falls back on transport failure
to the exact pinned API asset. It accepts only validated release coordinates,
requires a fixed SHA-256, restricts HTTPS redirect hosts, strips authorization
on redirects and sends credentials only to the initial API request. Checksum
failure does not trigger another source or publish bytes. Download size/time,
runner-temp output confinement and atomic replacement are bounded. Cached files
are rehashed; symlink/hardlink outputs are not trusted as cached binaries.
Archive extraction rejects traversal, links, special files and excessive size or
member counts before extracting with Python's data filter.

## Preserved toolchain

- GitHub CLI 2.102.1: existing checksum retained, asset ID 660284822.
- Lychee 0.24.2: asset ID 409959156 and SHA-256 pinned. The previous action did
  not pin the downloaded binary digest. The workflow still uses the same link
  arguments, accepted status codes, report and advisory link-result policy;
  an absent/empty report is a configuration failure. Shell `eval` is removed.
- Chart-testing 3.15.0: archive asset 614959662 and bundle 614959827 are pinned.
  Cosign 3.0.6 retains the bootstrap checksum from upstream
  `sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6`.
  Blob verification remains mandatory with the existing certificate identity
  `https://github.com/helm/chart-testing/.github/workflows/release.yaml@refs/heads/main`
  and issuer `https://token.actions.githubusercontent.com`.
  Yamllint 1.33.0 and Yamale 6.0.0 remain in an isolated Python environment;
  standard `venv`/pip replace the additional uv bootstrap dependency.

The tool versions, signature identity and Python-tool versions were compared
against the previously pinned `helm/chart-testing-action@720270857a28afd41e2426521a7801db09e9b510`
and `lycheeverse/lychee-action@e7477775783ea5526144ba13e8db5eec57747ce8`.
Installers remain scoped to the existing Ubuntu 24.04 Linux x64 jobs. They use
preinstalled Python 3.12+, runner-temp directories, minimal read permissions and
existing native architecture routing. No CodeQL invocation, secret scope,
runner class or application runtime changes.

## Qualification

- Nine downloader security/atomicity/cache/archive tests pass. Tooling contracts
  invoke them as part of the ordinary Linux script suite.
- The three composite action scripts run locally against real pinned assets;
  API fallback is observed for Lychee, chart-testing and GitHub CLI. Cosign's
  archive signature verification reports `Verified OK`. Tool versions and
  actual `ct lint --all --validate-maintainers=false` pass.
- Focused `contracts` CI now exercises the release CLI/security regressions,
  documentation link-check workflow and Helm workflow on their selected hosted
  class. This validates workflow-only changes without repeating an identical
  application build. It does not turn the earlier two setup failures into a
  successful full run; retain those logs and link the focused recovery run.
- Application runtime files and package/lock inputs are unchanged from the
  application-tested e5545e09a milestone. Released-artifact qualification remains
  required independently of source and bootstrap checks.

Evidence is retained on kspld0 in
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/`:
`final53-*-ci.log`, `tool-bootstrap-*.log` and `e554-ci-final-jobs.json`.
Verified binaries, archives and isolated environments are retained in the task
cache's `tool-bootstrap-host` directory. Do not install into shared HOME paths
or remove other runner/agent caches.
