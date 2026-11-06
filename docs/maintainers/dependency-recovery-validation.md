# Pending dependency contribution recovery

Preserve the original histories of PRs #541, #542, #543, #544, #546, #547, #548
and #549. This branch uses its own installed dependencies; it does not modify the
shared dependency cache used by the other recovery branches.

## Source review

- ORAS setup 2.0.3: pinned official tag resolves to
  `5e2f2482b30b0cb3e14e67f89a80c88c659a7c63`. Reviewed upstream comparison;
  release-data updates retain official ORAS download URLs and checksums.
- Docker login 4.7.0: pinned official tag resolves to
  `81c6f93d4bc991e510b342a00b419b3bb4efc5c6`. Reviewed registry-host normalization,
  preserved child-path containment and password masking, and normalization of ECR
  false/true values. This repository retains its fixed registry endpoints,
  permissions and secret boundaries.
- Cypress action 7.4.8: pinned official tag resolves to
  `4ce68f262a3888d22cf3175d62010a145ba737ee`. Reviewed comparison; build cleanup,
  examples and dependency updates do not add a new application execution path.
- Runtime versions: undici 8.12.3, node-schedule 2.1.2, react-intl 12.1.6 and
  @tanem/react-nprogress 7.1.9. Cypress package 16.2.1 remains a development tool.
  Frozen installation validates lockfile integrity; initial installation disables
  lifecycle scripts. Only the expected eight original histories are combined.

React Intl's new typed-message result exposed a real TypeScript incompatibility
in the application's generic message helper. FormatJS's implementation returns
its input descriptor map unchanged. Retaining that call and returning the
application's constructed map preserves exact generic defaults without a type
assertion or a runtime behavior change.

## Verification

Evidence is retained in
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`.
Frozen installation passes. Server and client typechecks pass after the message
helper repair. Ten scheduler native cases pass; SQLite's native in-memory query
smoke check passes. Production dependency audit reports one low-severity deepmerge
advisory and no moderate/high/critical findings; the repository's vendor patch
remains required. This is not a zero-vulnerability claim.

Upstream action comparisons and independently resolved release tags are retained
in `dependency-upstream-action-review/`. The integrated production build passes with the full recovered theme, policy,
episode and discovery source. Seven headless browser cases pass at desktop and
phone widths, including theme persistence and explicit Search. Seven focused
component/credit cases and five deepmerge exploit probes pass. Full native and
browser CI remains required before merging. CodeQL stays
disabled under the owner directive; runner routing is unchanged.
