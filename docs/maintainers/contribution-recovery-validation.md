# Contribution recovery integration validation (2026-11-05)

This integration preserves the current live heads of 31 original contributions:
#506, #507, #512, #464, #495, #486, #448, #441, #436, #435, #445, #483,
#484, #465, #468, #470, #460, #459, #456, #442, #475, #473, #433, #426,
#471, #487, #438, #440, #434, #462 and #427.

The original histories and review repairs are combined from integration PRs
#530, #531, #534, #535, #536, #537 and #538. Git ancestry was checked against
all 31 live GitHub PR heads. A closed PR without ancestry or equivalent behavior
is not considered integrated. Remaining contributions and issue reports still
require their own review and evidence.

## Combined validation

- Complete production build and merged-file lint pass.
- 380 native API/provider/auth/dispatch regressions pass.
- 13 Discover hook and safe-return-path tests pass.
- 11 browser regressions pass across desktop and phone viewports: account cache
  isolation, administrator network settings, provider recovery/sorting, and
  request-history preservation.
- 29 Helm, workflow-boundary and release-metadata tests pass.
- Eleven Cypress movie/navigation checks pass together in headless Chromium.
- A separate worker-enabled Playwright check verifies repeated authenticated
  document navigation with the real service worker controlling the page.
- The complete documentation site generates successfully. The shared local
  Docusaurus dependency cache produced cross-worktree metadata collisions;
  `DOCUSAURUS_NO_PERSISTENT_CACHE=1` isolates that local build without deleting
  caches. Fresh CI installations do not reuse this task cache.

Cypress's proxy-intercepted suites use Chromium's
[`Network.setBypassServiceWorker`](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-setBypassServiceWorker)
through its browser automation channel. A controlling worker could otherwise
bypass intercepted HTTP and Cypress's instrumented iframe navigation. This
changes the test harness only. The real-worker Playwright check remains enabled.

## Workflow review

CodeQL stays disabled and its obsolete release fragment is removed. The fork
caller had a public-runner header but still pinned a historical private-JIT
callee. Its pin now selects the already-published, reviewed hosted-runner callee
at `bf22a557af8ebc84fb21d6200b85b33065a0b209`. Owner-label gating, read-only
permissions, fork/base checks, exact checkout SHA and disabled credential
persistence remain intact. No secrets are passed to fork validation.

## Evidence and limits

Detailed component validation lives in the administrator network, provider
recovery and account cache boundary runbooks. Logs, screenshots, traces, original
head containment and audit ledgers are retained under
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`.
Provider responses and accounts are isolated fixtures. Physical Plex app handoff,
a live Kubernetes cluster and the remaining backlog are not certified by this
integration. Full exact-head CI is required before delivery.
