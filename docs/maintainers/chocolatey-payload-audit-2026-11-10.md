# Chocolatey payload audit — 2026-11-10

## Scope

Inspected all 72 default branches of the repositories owned by `snapetech-org` and
`snapetech`, including `.nuspec` and `.nuspec.in` templates. Count mirrored and
legacy manifests separately, but follow each install script to the actual release
download instead of treating every Windows release asset as a Chocolatey input.

The nine manifests represent seven distinct package identities across eight
repositories. ChaptarrNG contains both `chaptarrng` and the legacy `bookshelfng`
migration package. `bookshelfng-unraid` mirrors BookshelfNG's packaging; it is not
an additional package identity. The old PlezyNG repository URL and local alias do
not represent another repository or package.

The [machine-readable inventory](chocolatey-payload-inventory-2026-11-10.json)
records every repository and manifest. Truncated recursive GitHub tree responses
were split into complete subtrees. The large winget fork was checked using a
complete recursive Git tree listing at its fetched default-branch commit instead
of accepting a truncated API result.

## Published payload snapshot

Sizes are bytes from GitHub release asset metadata observed on 2026-11-10. Existing
release assets were not replaced, and no new release was published by this audit.

| Repository / package                     | Observed release        | Chocolatey download                        |       Bytes | Disposition                                                                              |
| ---------------------------------------- | ----------------------- | ------------------------------------------ | ----------: | ---------------------------------------------------------------------------------------- |
| `seerrng`                                | `v3.72.29`              | `seerrng-v3.72.29-windows-x64.zip`         | 755,307,021 | Reduce duplication and debug-only content; enforce budget                                |
| `chaptarrng` / legacy `bookshelfng`      | `v0.9.995`              | `ChaptarrNG-0.9.995-win-x64.zip`           | 226,951,752 | Earlier fix `de971c38110f6f25a11c1c0bb016f81ead6bbbc5` already guards the next x64 build |
| `bookshelfng` / its Unraid source mirror | `v0.4.21.85`            | `BookshelfNG-v0.4.21.85-win-x64.zip`       | 137,010,742 | No shrink needed; add publication guard                                                  |
| `pleazyng`                               | `v3.0.7`                | `pleazyng-windows-installer.exe`           | 120,390,834 | No shrink needed; guard both installer and `.nupkg`                                      |
| `slskdN`                                 | `2026101818-slskdn.352` | `slskdn-main-win-x64.zip`                  | 115,055,595 | No shrink needed; add publication guard                                                  |
| `slskr`                                  | `v0.2.86`               | `slskr-v0.2.86-x86_64-pc-windows-msvc.zip` |  26,307,688 | No shrink needed; add publication guard                                                  |
| `iptvtunerr`                             | `v0.1.95`               | `iptv-tunerr-v0.1.95-windows-amd64.zip`    |   9,559,078 | No shrink needed; add publication guard                                                  |

SeerrNG's published ARM64 ZIP is also oversized at 735,693,645 bytes. It is not
currently downloaded by Chocolatey, but the same build fix and budget cover both
Windows architectures. BookshelfNG's 246,526,673-byte setup EXE is not downloaded
by its Chocolatey installer; shrinking that unrelated asset is unnecessary for
this audit. ChaptarrNG's Windows x86 ZIP is likewise not a Chocolatey input.

## Changes

- SeerrNG installs staged Windows production dependencies with pnpm's hoisted
  linker. This avoids recursively materializing repeated pnpm junction targets
  in the ZIP while retaining native runtime modules and dependency versions.
- Omit JavaScript dependency source maps and `public/readme-covers`. The latter
  is referenced only by `cypress/e2e/readme-screenshots.cy.ts`, not application UI.
  Preserve other public assets, compiled application output and native libraries.
- Use maximum ZIP Deflate compression. Reject Windows archives larger than
  190,000,000 bytes before moving them into the final distribution path or
  generating checksums. Stage temporary runtime content under that task's
  distribution directory and remove it through the existing exit trap.
- Reject oversized downloads in every other active Chocolatey publisher. The
  BookshelfNG source-sync hooks also propagate its guard to `bookshelfng-unraid`.
- Preserve all existing versions, checksums, install/service behavior and native
  platform coverage. The budget is a regression gate, not an assurance of
  moderator approval or a substitute for security scanning.

## Validation

- SeerrNG release-construction and release-workflow tests: 56 passed, including
  retained native files, removed debug/fixture content, hoisted install arguments,
  and atomic rejection without replacing an existing archive or checksum.
- Execute the actual six publisher guard snippets at 189,999,999, 190,000,000 and
  190,000,001 bytes: all 18 boundary cases passed. The exact budget is accepted;
  one byte over is rejected.
- slskR's existing Chocolatey workflow/checksum regression suite: nine passed.
- Modified workflow YAML parses successfully; SeerrNG workflow formatting and
  Bash syntax checks pass. Applicable commit-time security scans report no
  findings. Pleazyng's workflow-only change uses targeted changelog and packaging
  checks rather than the unrelated full Flutter commit hook.
- ChaptarrNG's earlier Windows archive acceptance run
  [42850518411](https://github.com/snapetech-org/chaptarrng/actions/runs/42850518411)
  passed at the existing packaging fix.
- SeerrNG native x64/ARM64 package validation is tracked in
  [42868117978](https://github.com/snapetech-org/seerrng/actions/runs/42868117978).
  Both native jobs passed at source commit
  `bbdffe8db`. Windows x64 produced a 184,837,015-byte ZIP, down from
  755,307,021 bytes; Windows ARM64 produced a 179,008,508-byte ZIP, down from
  735,693,645 bytes. ZIP integrity/extraction, native SQLite/bcrypt/Sharp/Next
  dependencies, database startup, HTTP API and frontend checks passed on both
  architectures. Independent inspection of both downloaded archives also
  verified ZIP integrity and SHA-256 sidecars, retained native libraries and
  removal of the selected debug/fixture content. Both contain 56,554 ZIP entries
  instead of the published x64 archive's 201,380 entries. Exact sizes, hashes and
  retained native-module counts are recorded in the
  [build receipts](chocolatey-payload-builds-2026-11-10.json).

IPTV Tunerr's GitHub push succeeded. Its additional GitLab push destination
rejected the update because its history diverges, including an independent
donation-links commit. No force-push or unrelated history merge was attempted.
