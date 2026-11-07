# Catalog Packaging Recovery — PR #137

PR #137's three original commits were closed without their catalog preparation
files reaching main. This recovery preserves that ancestry and repairs the
candidate deployment contracts against the published v3.72.16 image, pinned to
`sha256:b2bd0d2288898efcdb602f1f4863e86dff3fed1cfba5641d54072ab4702942fa`.

## Repairs

The generic Compose contract binds to loopback by default, persists the complete
configuration directory, runs without root capabilities and uses a read-only
root filesystem with explicit temporary cache locations. Image names and source
links use the canonical organization.

Cloudron stores SQLite and settings in its backed-up localstorage directory.
The manifest declares the SQLite file for consistent backups. The initializer
restores ownership without following stored symlinks and drops root before
loading application modules. Its managed HTTPS origin configures native proxy
support before login. The false published-version descriptor was removed.

The Co-op Cloud recipe mounts an unprivileged startup adapter, validates its
HTTPS origin and configures the same native proxy support. The backend must be
isolated behind the proxy, which must replace caller forwarding headers. SQLite
uses one replica. StartOS preparation links the existing companion repository;
it does not claim that its older package has been updated or qualified.

## Local Qualification

On November 6, 2026, local container checks verified:

- Generic Compose startup, health, a persistent SQLite canary across restart,
  and a v3.72.15 to v3.72.16 image upgrade retaining that canary.
- Cloudron read-only startup, UID/GID 1000, zero effective application
  capabilities, restored storage permissions and restart. An external-target
  symlink probe did not change the target's ownership.
- Cloudron v3.72.16 login through an isolated HTTPS reverse proxy with a Secure,
  HttpOnly session cookie; SeerrOrig and SeerrNGJ changes persisted after reload.
- Both startup adapters' origin validation, privilege failure and settings-save
  failure cases. The tooling registry includes these tests.
- Co-op Cloud adapter startup from the pinned image and the same isolated HTTPS
  login, Secure session cookie, and persisted theme switching checks. Compose
  and Docker Stack configuration parsing also passed; no Swarm was deployed.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-catalog-recovery-137-20261106`.
The containers use isolated fixture data and block external provider requests.

These are package candidates. Real Cloudron installation/update/backup restore,
Co-op Cloud Swarm/Traefik deployment, and updating and sideloading the companion
StartOS package remain platform acceptance work before marketplace publication.
No marketplace submission, wishlist issue or email was sent. YunoHost remains
retired under the owner's separate directive.

## v3.72.20 candidate refresh

The generic Compose, Cloudron and Co-op Cloud candidates now pin the verified
v3.72.20 manifest, `sha256:d3ac93c938c80a46563f1091ad06b4b75c6f2b7e0b1f6cbcb055ad87f2f46804`.
The Cloudron wrapper version advances to 0.1.1. Local qualification repeats:

- Generic Compose upgrades the actual v3.72.16 fixture to v3.72.20, remains
  healthy, preserves its SQLite canary, and retains it across restart.
- Both adapters restart with a read-only root filesystem; the application runs
  as UID/GID 1000 with zero effective capabilities. Cloudron bootstrap uses
  CHOWN, DAC_OVERRIDE, SETUID and SETGID, then drops privileges. DAC_OVERRIDE
  permits the root bootstrap to traverse the private 0700 data directory on
  restart; it is not retained by the application.
- Both isolated HTTPS proxies pass login with Secure/HttpOnly cookies, persisted
  switching between both skins, and direct offline-utility recovery, before and
  after restart. Four skin captures were inspected.
- All 24 startup/origin tests pass. Compose and Stack configuration parsing pass;
  Stack parsing is repeated with explicit sample deployment variables.

New evidence is under the incoming-review deliverable directory recorded in
[the v3.72.20 qualification](release-3.72.20-verification.md). The platform
acceptance and marketplace exclusions above still apply; local Docker proxies
do not establish a real Cloudron restore or Swarm/Traefik deployment.
