# GitHub Free organization and runner-group migration plan

Status: partially complete as of 2026-10-13 23:50 UTC. The repository transfers and secure runner-group configuration are complete; runner membership and workflow cutover are not.

## Verified live state

All eight target repositories are public and owned by `snapetech-org`: SeerrNG, SLSKR, SLSKDN, QuestarrNG, TorrentNG, ROMarrNG, ChaptarrNG, and BookshelfNG.

The organization runner group `trusted-main` (id 3) is configured with:

- Visibility `selected`, public repository access enabled, and workflow restrictions enabled.
- Exactly the eight repositories above.
- Nine workflows pinned to `refs/heads/main`: `bookshelfng/build.yml`, `chaptarrng/build.yml`, `QuestarrNG/ci.yml`, `ROMarrNG/docker.yml`, `seerrng/ci.yml`, `slskdN/ci.yml`, `slskdN/ci-enhancements.yml`, `slskr/ci.yml`, and `TorrentNG/ci.yml`.
- Zero attached runners at the last live check. The group is configured but not operational.

The `Default` group still holds 18 registered runners. Their online status does not mean they are members of `trusted-main`; runner membership has not been changed. The migration PRs are open across all eight repositories, and the routing changes are not active on their default branches yet.

TorrentNG's `backend-evidence.yml` is intentionally excluded from `trusted-main` because it runs live device and production-soak evidence. Keep that workflow on its existing runner arrangement.

## Routing and security boundary

Pull-request, tag, and non-main validation stays on standard GitHub-hosted runners. Only the exact workflows above may use the shared local pool, and only for trusted `main` pushes or manual runs against `main`. The organization runner-group restriction is the server-enforced control; workflow expressions alone do not protect a public self-hosted runner.

The `TRUSTED_MAIN_RUNNERS_ENABLED` variable is currently unset in QuestarrNG and SLSKDN. Do not set it to `true` until `trusted-main` has an online runner with the labels those workflows require. SLSKDN also retains its `slskdn` label requirement.

The shared pool is for trusted main validation. It will not run contributor pull-request code and therefore will not directly drain the GitHub-hosted pull-request queue. Keep PR validation on hosted runners as required by the public-repository security boundary.

## Remaining work

1. Complete and integrate the per-repository routing changes without canceling existing work.
2. Attach only suitable, least-privilege NG runners to `trusted-main`; retain a separate runner for any excluded deployment or live-evidence workflow.
3. Enable the QuestarrNG and SLSKDN route flags only after the group runner is online and its labels are verified.
4. Run a trusted main workflow in each repository and confirm the selected runner group, labels, and job outcome. Verify pull-request workflows remain hosted.
5. Keep Actions queue snapshots separate from runner utilization: queued hosted PR jobs and idle local runners represent different capacity pools.

## References

- [GitHub Actions limits](https://docs.github.com/en/actions/reference/limits)
- [GitHub-hosted runner availability for public repositories](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Runner groups for self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access)
- [GitHub's self-hosted runner security guidance](https://docs.github.com/en/actions/reference/security/secure-use)
- [Moving repositories to an organization](https://docs.github.com/en/account-and-profile/how-tos/account-management/moving-your-work-to-an-organization)
