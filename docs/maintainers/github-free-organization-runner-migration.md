# GitHub Actions runner routing

Status: GitHub-hosted runners are primary for SeerrNG since the owner directive
of 2026-11-03. SeerrNG is a public repository; standard GitHub-hosted runners
are free and unlimited for public repositories. See the [GitHub-hosted runners
reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#standard-github-hosted-runners-for-public-repositories).

Use these labels to preserve native platforms in release builds:

| Target | GitHub-hosted label |
| --- | --- |
| Linux x64 | `ubuntu-24.04` |
| Linux arm64 | `ubuntu-24.04-arm` |
| macOS arm64 | `macos-26` |
| macOS x64 | `macos-26-intel` |
| Windows x64 | `windows-2025` |
| Windows arm64 | `windows-11-vs2026-arm` |

Private ephemeral JIT runners are reserved for work that needs private network
access, special hardware, or explicit JIT validation. Currently only
`.github/workflows/gvisor-runner-smoke.yml` uses the private gVisor runner group;
that workflow checks the sandbox boundary itself. Public-fork validation runs
on GitHub-hosted runners with read-only repository permissions and no secrets.

The main CI workflow remains manually dispatchable from `main`; choose
`action=ci` and `runner_pool=public` for validation. Image publication remains
a separate explicit `action=publish-image` dispatch from `main`.

CodeQL is disabled across `snapetech-org` by the owner directive of
2026-10-30. Do not restore CodeQL workflows or invocations unless that
directive is explicitly reversed.

Live deployment still requires a separate configured deployment path.
`scripts/verify-live-deployment.sh` remains available for checking a live
deployment after it is performed.
