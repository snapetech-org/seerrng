# GitHub Actions runner routing

Status: GitHub-hosted runners are the default for SeerrNG under the owner
directive of 2026-11-13. SeerrNG is a public repository; standard
GitHub-hosted runners are free and unlimited for public repositories. See the
[GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#standard-github-hosted-runners-for-public-repositories).

Use these labels to preserve native platforms in release builds:

| Target | GitHub-hosted label |
| --- | --- |
| Linux x64 | `ubuntu-24.04` |
| Linux arm64 | `ubuntu-24.04-arm` |
| macOS arm64 | `macos-26` |
| macOS x64 | `macos-26-intel` |
| Windows x64 | `windows-2025` |
| Windows arm64 | `windows-11-vs2026-arm` |

Private ephemeral JIT is reserved for explicit overflow on `kspld0` or
`kspls0` (Linux or Windows, x64 or ARM64) and Apple-signed builds on the
MacBook Air. These are explicit routes, never automatic fallbacks. The former
`.github/workflows/gvisor-runner-smoke.yml` private-runner exception was removed
on 2026-11-13; no current workflow requires private JIT. `xcode-27` is a
GitHub-hosted image. Public-fork validation runs on isolated disposable
GitHub-hosted runners with read-only repository permissions and no secrets.

The main CI workflow remains manually dispatchable from `main`; choose
`action=ci` and `runner_pool=public` for validation. Image publication remains
a separate explicit `action=publish-image` dispatch from `main`.

For a release-note or Helm tooling repair, `action=contracts` runs just those
two checks from the current `main` revision without repeating application
builds or publishing images:

```sh
gh workflow run ci.yml --repo snapetech-org/seerrng --ref main \
  -f action=contracts -f runner_pool=public
```

CodeQL is disabled across `snapetech-org` by the owner directive of
2026-10-30. Do not restore CodeQL workflows or invocations unless that
directive is explicitly reversed.

Live deployment still requires a separate configured deployment path.
`scripts/verify-live-deployment.sh` remains available for checking a live
deployment after it is performed.
