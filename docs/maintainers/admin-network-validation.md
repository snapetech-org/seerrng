# Administrator network restriction recovery

Recover PR #464 with its original history. A configured allowlist applies to
administrator browser authentication and existing sessions; ordinary accounts and
API-key integrations retain their documented access. Client identity uses Express's
configured proxy trust, with direct forged headers rejected when proxy trust is off.

The recovery fixes a TypeScript optional-IP narrowing error and regenerates the
stale English field guidance. No shared CSS owners are changed. The settings use
the existing form rows, SettingsField selection controls, textarea and Alert owners.

Validation on 2026-11-05:

- Eleven focused backend tests pass: IPv4/IPv6/mapped peers, malformed/oversized
  policy, administrator authentication, existing sessions, ordinary accounts,
  API keys, spoofed forwarding headers, safe policy persistence and lockout rejection.
- The complete production build passes after synchronizing extracted messages.
- A running-app Playwright flow passes: enable/save an allowed policy, reject an
  excluding replacement, display the server explanation, and disable the policy.
- Baseline main and candidate `/settings/network` render at 1440×900 and 390×900.
  Candidate captures include disabled and enabled states; existing controls,
  selection geometry, Save/Cancel actions, surfaces, field alignment and narrow
  textarea bounds are checked. New controls retain the shared field owners.

Evidence lives in
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`
under `admin-*`. Runtime data is disposable and separate from the user checkout.
Headed desktop-pool capacity was unavailable; headless QA was authorized. These
checks do not establish real reverse-proxy deployment configuration correctness.
