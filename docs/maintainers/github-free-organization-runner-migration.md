# GitHub Actions runner routing

Status: superseded 2026-10-26 by the organization-wide private JIT runner policy.

All SeerrNG build, test, scan, package, and release jobs must use compatible
private ephemeral JIT runners. GitHub-hosted runners and hosted fallback are
not authorized. The shared runner inventory, workflow allowlists, and broker
deployment procedure are maintained in
`snapetech-org/packer/scripts/shared-jit-runner-pool/`; verify live broker and
host state before treating a workflow change as deployed.

The SeerrNG main CI workflow is deliberately dispatch-only. Maintainers start
validation from `main` with `action=ci` and `runner_pool=private`. Image
publication remains a separate explicit `action=publish-image` dispatch, also
from `main` on the private pool. A push to `main` does not start CI.

CodeQL is disabled across `snapetech-org` by the owner directive of
2026-10-30. Do not restore CodeQL workflows or invocations unless that
directive is explicitly reversed.

Live deployment still requires a separate configured deployment path.
`scripts/verify-live-deployment.sh` remains available for checking a live
deployment after it is performed.
