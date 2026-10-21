# OIDC rollout validation

This record captures the repository checks run for the nine-application OIDC
rollout. Automated tests validate local behavior; no live identity-provider
registrations or credentials were available, so no external provider login was
performed.

## Results

| Application | Validation | Result and limit |
| --- | --- | --- |
| SeerrNG | `pnpm exec vitest run server/routes/auth.test.ts src/utils/oidc.test.ts` | 139 tests passed in the clean rollout worktree. |
| SeerrNG | `pnpm typecheck:server` | Passed in the clean rollout worktree. The broader source-checkout suite also passed: 613 files, 4,377 tests passed, with 2 files and 5 tests skipped. |
| slskR | `cargo test --workspace` | Full Rust workspace suite passed. |
| slskR | `pnpm exec vitest run web/src/lib/oidcProvider.test.js` | 7 provider-presentation tests passed in the clean rollout worktree. The package-manager dependency setup check reported an unavailable RustyMilk Git dependency; Vitest still ran against existing dependencies and passed. The broader source-checkout web suite passed: 161 files and 1,038 tests. |
| slskdN | Full unit suite | Passed in the source checkout: 5,863 tests. |
| slskdN | OIDC provider-presentation tests | 7 tests passed in the clean rollout worktree. |
| TorrentNG | `pnpm exec vitest run` (Web UI) | 9 files and 49 tests passed in the clean rollout worktree. |
| TorrentNG | `pnpm exec tsc --noEmit` (Web UI) | Passed. |
| TorrentNG | `pnpm build` (Web UI) | Production build passed. Vite reported the existing large-chunk advisory. |
| TorrentNG | `cargo +1.97.0 test --manifest-path sidecar/Cargo.toml` | Full sidecar suite passed in the clean rollout worktree: 427 passed and 2 ignored across the library and integration-test binaries. The run also caught and fixed two test fixtures that needed the new OIDC auth state. |
| IPTV Tunerr | `go test ./...` | Full Go suite passed in both the source checkout and the clean rollout worktree. The clean worktree used vendored dependencies. |
| ROMarrNG | Focused OIDC/provider tests in the clean rollout worktree | 7 tests passed. The source checkout's full suite reported 2,379 passed, 2 skipped, and 1 deselected, plus one unrelated Docker workflow test failure; focused security/OIDC tests in the source checkout passed (21 passed, 1 skipped). |
| QuestarrNG | `npm run check -- --noEmit` | Passed in the clean rollout worktree. |
| QuestarrNG | Provider helper tests in the clean rollout worktree | 6 tests passed. The broader source-checkout Vitest run passed 4,528 tests and skipped 7; two unrelated suites timed out under parallel load, then passed when rerun individually (24 tests total). |
| BookshelfNG | `dotnet build src/NzbDrone.Host/Readarr.Host.csproj --no-restore -p:ReadarrRootDir=<task-scratch>/dotnet/bookshelf/` | Passed with zero warnings and zero errors. The OIDC-filtered Core test selection contained no matching test cases. |
| ChaptarrNG | OIDC-filtered tests in the clean rollout worktree | 27 tests passed with the repository's required .NET SDK and the locally available SixLabors license file. No license check was disabled. |

## Operator documentation and navigation

Each application has an operator guide that covers its configuration surface,
exact callback, verified-email admission, local identity/session behavior,
recovery, Apple flow, and troubleshooting. Root READMEs link directly to the
app guide; maintained documentation indexes link to the same guide. All guides
point to the shared provider catalog and cross-project implementation
contract.

| Application | Operator guide |
| --- | --- |
| SeerrNG | [OIDC sign-in](https://github.com/snapetech-org/seerrng/blob/main/docs/using-seerr/settings/users/oidc.md) |
| slskR | [OIDC authentication](https://github.com/snapetech-org/slskr/blob/main/docs/oidc-authentication.md) |
| slskdN | [OIDC authentication](https://github.com/snapetech-org/slskdN/blob/main/docs/oidc-authentication.md) |
| TorrentNG | [OIDC authentication](https://github.com/snapetech-org/TorrentNG/blob/main/docs/OIDC_AUTHENTICATION.md) |
| IPTV Tunerr | [Control Deck OIDC](https://github.com/snapetech/iptvtunerr/blob/main/docs/how-to/oidc-control-deck.md) |
| ROMarrNG | [OIDC authentication](https://github.com/snapetech-org/ROMarrNG/blob/main/docs/oidc-authentication.md) |
| QuestarrNG | [OIDC authentication](https://github.com/snapetech-org/QuestarrNG/blob/main/docs/oidc-authentication.md) |
| BookshelfNG | [OIDC authentication](https://github.com/snapetech-org/bookshelfng/blob/main/docs/oidc-authentication.md) |
| ChaptarrNG | [OIDC authentication](https://github.com/snapetech-org/chaptarrng/blob/main/docs/oidc-authentication.md) |

The shared [provider catalog](./oidc-provider-catalog.md) is the human-readable
index to all 15 provider entries and official setup pages; the JSON catalog
remains the machine-readable source consumed by the applications.

## Interoperability and security boundaries

- A cross-project parity check confirmed that all nine presentation maps
  contain the same 14 branded provider IDs, all nine local SVG sprites are
  byte-identical, and the shared catalog has 15 entries including generic
  OIDC.
- All application adapters have focused source-level and/or automated test
  coverage for their local provider flow and provider presentation as listed
  above. The degree of coverage differs with each application's test layout.
- Provider logos are local SVG symbols. Provider setup links point to the
  providers' official documentation; the catalog lives beside the shared
  cross-project contract.
- The generic discovery path remains available for providers without a named
  preset. Provider IDs select presentation and setup guidance, not issuer
  trust or token-validation rules.
- External identity-provider interoperability still needs a deployment-owned
  smoke test using real test tenants, registered callback URLs, and disposable
  credentials.
