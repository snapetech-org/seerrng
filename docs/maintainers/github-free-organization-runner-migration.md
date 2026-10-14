# GitHub Free organization and runner-group migration

Status: in progress. The live snapshot below was checked on 2026-10-14 UTC.

## Scope

The eight public NG repositories are SeerrNG, SLSKR, SLSKDN, QuestarrNG, TorrentNG, ROMarrNG, ChaptarrNG, and BookshelfNG. PR and non-main validation stays on GitHub-hosted runners. Only trusted main validation can use the shared local pool after the repository opt-in is enabled.

## Live runner-group state

The organization runner group trusted-main (id 3) currently has selected repository access, public repositories enabled, and workflow restrictions enabled. It is accessible to 14 repositories: the eight NG targets and the existing 0xBEEF, Lack, MilkRust, packer, PalWorldSelfHost, and slskNet.Runtime repositories. Preserve those six unrelated repositories and their existing workflow access.

The current workflow allowlist has 21 main-ref paths. Nine are the intended NG validation workflows:

- BookshelfNG/build.yml
- ChaptarrNG/build.yml
- QuestarrNG/ci.yml
- ROMarrNG/docker.yml
- SeerrNG/ci.yml
- SLSKDN/ci.yml and ci-enhancements.yml
- SLSKR/ci.yml
- TorrentNG/ci.yml

The allowlist still contains four other NG paths: SeerrNG/create-tag.yml, helm.yml, and release.yml, plus TorrentNG/release.yml. These paths should be removed after existing queued and in-progress Actions runs drain. TorrentNG/backend-evidence.yml is no longer allowlisted. Preserve the eight selected workflow paths belonging to the six unrelated repositories.

Eight runners are attached to trusted-main and online. Runner 145 is busy; the other seven were idle at the snapshot. The repository variable TRUSTED_MAIN_RUNNERS_ENABLED is unset in all eight targets; SLSKDN has only its existing PREFER_SELF_HOSTED variable. The route PRs are still open, so their workflow updates are not active on the default branches.

## Runner selection

Each validation job returns one string from runs-on: trusted-main for pushes or manual runs on main when TRUSTED_MAIN_RUNNERS_ENABLED is exactly true; ubuntu-latest for pull requests, tags, non-main manual runs, and the unset/false case. This selects the restricted runner group without relying on an empty group plus hosted labels. The group restriction is the server-side security boundary; expressions alone do not protect a public self-hosted runner.

The shared local pool will not run contributor pull-request code and therefore will not directly drain the GitHub-hosted PR queue. Keep PR validation hosted.

## Rollout

1. Update all eight route PRs to use a supported string-valued group selector with hosted fallback, and exact-head validate and review each change.
2. Wait for existing queued and in-progress Actions runs to drain before changing group membership or its workflow allowlist. Do not cancel current/head-valid work.
3. Remove the four non-validation NG workflow paths listed above while preserving the six unrelated repositories and their allowlisted workflows.
4. Verify the runner membership and labels against the main validation requirements; do not move release, deployment, or live-evidence runners into this group.
5. After the route PRs merge and the group is ready, enable TRUSTED_MAIN_RUNNERS_ENABLED in each target repository and dispatch one trusted main validation run per project. Confirm runner selection and job results, then verify PR runs still use hosted runners.
6. Revalidate every open PR at its exact current head, review its diff and checks, merge eligible PRs to main, and verify the post-merge result.

## References

- [GitHub Actions limits](https://docs.github.com/en/actions/reference/limits)
- [GitHub-hosted runner availability for public repositories](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Runner groups for self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access)
- [GitHub's self-hosted runner security guidance](https://docs.github.com/en/actions/reference/security/secure-use)
- [Moving repositories to an organization](https://docs.github.com/en/account-and-profile/how-tos/account-management/moving-your-work-to-an-organization)
