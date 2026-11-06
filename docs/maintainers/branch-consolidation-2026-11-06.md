# Main consolidation — November 6, 2026

Owner delivery target: all useful work on main, no non-main owned branches or open PRs, CodeQL disabled and reported security issues remediated.

## Branches and contributions

Initial inventory:122 local branches, including main.108 non-main branches were already ancestors of main and were deleted after ancestry verification. The remaining13 were reviewed below: one merged contribution branch and12 superseded branches. Every existing worktree, including dirty worktrees, was preserved at its original commit with detached HEAD; no working files were reset or deleted.

PR590 merged normally as3c698e204. Its history includes the original PR589 contributor commit945de885e and the reviewed authentication hardening. GitHub correctly records both PRs as merged. Books navigation fix3ad36abc6 remains on main. GitHub's automatic merged-branch deletion is enabled.

| Retired branch | Disposition |
| --- | --- |
| `codex/avoid-duplicate-dispatch-available-media` | Main MediaSubscriber already completes pending requests and active seasons before redispatch; newer requester-tag and edition guards retained. |
| `codex/ci-node-container-24-22-2-20261101` | Main already pins Node24.22.2 and newer reviewed image digest; companion assertion patch equivalent. |
| `codex/disable-codeql-20261030` | Main removes CodeQL execution and has stronger workflow-boundary checks; old private runner formatting is superseded by owner public-runner directive. |
| `codex/fix-deepmerge-prototype-guard-20261101` | Main patches both operands and shipped entry points, with stronger regression matrix and updated patch hashes. |
| `codex/fix-user-bug-reports-20261106` | Merged as PR590 at3c698e204, including PR589 original history. |
| `codex/jellyfin-bootstrap-config-20261031` | Main auth persistChanges keeps configured connection/API key and current settings; equivalent repair under renamed local variable. |
| `codex/notification-event-localization-20261031` | Main has NotificationEventDescriptor, getNotificationEvent and localized durable outbox; newer translated behavior retained. |
| `codex/pr508-review-20261103` | All unique commits patch-equivalent to main (git cherry reports minus). |
| `codex/request-list-api-load` | Main already disables duplicate mount/focus/reconnect revalidation and reconciles incoming row data. |
| `codex/seerr-public-build-contract-fix-20261101` | Unique commit patch-equivalent to main. |
| `codex/seerrng-bookshelf-status-20261030-scratch` | Maintained docs already include final fa55ffab migration freeze/handoff; intermediate dated queue snapshots obsolete. |
| `codex/seerrng-jit-job-labels-20261031` | Unique commit patch-equivalent; current runner policy supersedes historical JIT routing. |
| `codex/seerrng-main-push-ci-20261031` | Unique commit patch-equivalent; current public runner policy retained. |

The local branch inventory now contains only main. Third-party repositories and their branches were not modified. Detached historical worktrees are preserved source/evidence, not active branches. Initial tips, per-branch ancestry and reviewed dispositions are retained in the task receipt. Non-main commits not reachable from the original main are also preserved in a verified recovery bundle outside the source repository; no backup branches were created.

## Security resolution

Security correction485dc0300 rejects expired stored sessions before authentication and prevents touch from renewing expired or destroyed rows. The regression first reproduced native signed-cookie replay returning200; the repaired store returns401 and does not renew the expired row, including after reopening persistent storage. Exact expiry boundary, valid renewal, missing and destroyed sessions are covered. The private report was closed with source-fix evidence; its original content and reporter credit were preserved privately. This does not claim older published releases were replaced.

Dependabot370 and372 both matched upstream deepmerge4.3.1 by version. Upstream has no fixed release. Both committed pnpm graphs already apply the locally maintained guard to source and compiled entry points. Runtime regression tests passed5/5. A fresh frozen-lockfile docs installation passed its dependency-patch suite3/3. The two alerts were dismissed as inaccurate for these patched graphs, with explicit local-remediation comments; they were not described as fixed upstream or dismissed as tolerated risk. Reassess whenever the patch or resolved dependency graph changes.

CodeQL default setup is unconfigured; no executable CodeQL workflow remains. Existing workflow-boundary regression tests enforce its removal. Dependabot updates, secret scanning and push protection remain enabled.

## Verification and boundaries

- Integrated focused Vitest:5 files,22 tests passed, including the Books fix and session regressions.
- Native session tests:3 passed; final fixture uses a generated per-test signing secret.
- Runtime deepmerge checks:5 passed. Fresh docs dependency-patch checks:3 passed.
- Server typecheck and changed-source lint passed. Normal commit/push checks passed; final staged security scan reported zero findings.
- Workflow-boundary checks:14 passed, including CodeQL removal.
- Live GitHub readback: no open PRs, no non-main owned branch, no open Dependabot/code-scanning/secret-scanning alerts and no triage/draft private advisory.

This work did not run a complete production release, publish a new version or claim every possible vulnerability is absent. Security remediation is committed on main; release qualification and older installed binaries remain separate. Existing shared-checkout documentation edits and all unrelated worktree files were preserved.
