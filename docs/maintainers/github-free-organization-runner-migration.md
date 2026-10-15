# GitHub Free organization and runner-group migration

Status: in progress. The live snapshot below was checked on 2026-10-14 UTC.

## Scope

The eight public NG repositories are SeerrNG, SLSKR, SLSKDN, QuestarrNG, TorrentNG, ROMarrNG, ChaptarrNG, and BookshelfNG. Pull-request and non-main validation stays on GitHub-hosted runners. Trusted main validation can use the shared local pool only through its server-side workflow allowlist and a repository readiness variable.

## Live runner-group state

The organization runner group `trusted-main` (id 3) has selected-repository visibility, public repositories enabled, and workflow restrictions enabled. It is accessible to 14 repositories: the eight NG targets and the existing 0xBEEF, Lack, MilkRust, packer, PalWorldSelfHost, and slskNet.Runtime repositories. Preserve those six unrelated repositories and their existing workflow access.

The current allowlist has 21 exact workflow paths, all pinned to `refs/heads/main`:

- Nine NG validation workflows: BookshelfNG/build.yml, ChaptarrNG/build.yml, QuestarrNG/ci.yml, ROMarrNG/docker.yml, SeerrNG/ci.yml, SLSKDN/ci.yml and ci-enhancements.yml, SLSKR/ci.yml, and TorrentNG/ci.yml.
- Four other NG paths remain: SeerrNG/create-tag.yml, helm.yml, and release.yml, plus TorrentNG/release.yml. Remove these only after relevant queues drain and confirming they do not support required workflows.
- Eight paths belong to the six unrelated repositories: 0xBEEF/windows-smoke.yml; Lack/contract-validation.yml, release.yml, and selector-regression.yml; MilkRust/ci.yml; packer/ci.yml; PalWorldSelfHost/deploy-public.yml; and slskNet.Runtime/windows-smoke.yml. Preserve them.

Eight runners are attached to `trusted-main` and online: four on `kspls0` (ids 131, 142, 145, and 147) and four on `kspld0` (ids 132, 133, 139, and 140). The `TRUSTED_MAIN_RUNNERS_ENABLED` variable is `true` in all eight NG repositories. This enables eligible main jobs, but it does not prove that each route has passed a completed main run.

Runner-route PRs are merged for BookshelfNG #129, ChaptarrNG #101, QuestarrNG #56, ROMarrNG #36, SLSKR #155, and SeerrNG #278. SLSKDN #372 and TorrentNG #195 remain open. SeerrNG's post-merge main run #38494618267 routed two unit-test shards to `kspls0` and two to `kspld0`, because the merged selector matched the generic `host` label. The run was still in progress when checked. This follow-up adds the `kspls0` label to the restricted group-and-label selector and its workflow contract test.

## Runner selection

Use the structured `runs-on` group-and-label form (the group and every listed label must match). Do not use the group name as a runner label or use host labels without the restricted group. SeerrNG unit-test shards require `trusted-main` plus `self-hosted`, `Linux`, `X64`, `host`, and `kspls0`. The deployment preflight and deployment jobs additionally require `linux-build`; all six runner labels exist on the online `kspls0` runner in `trusted-main`. These jobs use the pool only when `TRUSTED_MAIN_RUNNERS_ENABLED` is exactly `true`; otherwise they fall back to `ubuntu-latest`, where the deployment preflight safely skips when the server configuration path is absent.

The organization workflow allowlist is the server-side trust boundary. Event expressions and labels are routing conditions, not substitutes for that restriction. Keep contributor pull-request code off the local pool. The pool is shared selectively and does not replace each repository's hosted PR validation.

## Rollout

1. Review the open SLSKDN #372 and TorrentNG #195 route changes at their exact heads. Keep their PR and non-main jobs hosted, and retain repository-specific runner labels.
2. Wait for existing queued and in-progress Actions runs to drain before changing runner membership or the workflow allowlist. Do not cancel current/head-valid work.
3. Remove the four non-validation NG workflow paths listed above only after confirming that required release and deployment workflows no longer need them.
4. Re-read runner membership, labels, repository variables, and the workflow allowlist before relying on the pool.
5. For each merged route, verify an eligible main run used the intended group and labels, then verify pull-request runs stayed hosted. Treat queued, canceled, and still-running jobs as unknown.
6. Continue reviewing all open PRs and CodeQL/security findings across the NG repositories; merge only changes whose exact-head checks and security review are complete.

## References

- [GitHub Actions limits](https://docs.github.com/en/actions/reference/limits)
- [GitHub-hosted runner availability for public repositories](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Runner groups for self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access)
- [Using self-hosted runners in a workflow](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow)
- [GitHub's self-hosted runner security guidance](https://docs.github.com/en/actions/reference/security/secure-use)
- [Moving repositories to an organization](https://docs.github.com/en/account-and-profile/how-tos/account-management/moving-your-work-to-an-organization)
