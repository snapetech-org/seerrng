# Release download bootstrap recovery — November 8

Immutable v3.72.24 at `baa297629` remains an unpublished draft. Release run
[42470984114](https://github.com/snapetech-org/seerrng/actions/runs/42470984114)
completed two attempts. The native Linux/macOS/Windows/iOS/plugin builders and
both image vulnerability scans succeeded. Android failed before compilation:
first Gradle's distribution endpoint returned HTTP 504, then its ten-second
wrapper download timed out. Signing first failed installing Trivy, then failed
downloading the Cosign bootstrap with HTTP 504. Publication, package-channel
dispatch, stable alias promotion and announcement did not complete. Successful
artifacts and downloaded-image QA are retained; the tag must not be moved.

The next release retains the same tool versions and trust requirements:

- Gradle 9.6.0: the wrapper's existing SHA-256 is unchanged. A bounded verified
  public release download falls back to the same official GitHub asset API.
  A temporary checkout-only distribution URL points to those verified local
  bytes. The wrapper still validates its checksum and performs extraction.
  Unsupported versions, altered pins, duplicate keys, archive tampering,
  symlinks, hardlinks and paths outside the task directory fail closed.
- Cosign 3.0.6: pinned binary and verification bundle; mandatory `verify-blob`
  retains the existing publisher identity
  `keyless@projectsigstore.iam.gserviceaccount.com` and Google OIDC issuer.
- Trivy 0.74.0: pinned existing Linux x64 binary through the shared verified
  downloader. Scanner severity, ignore-unfixed policy, exit codes, databases,
  architecture targets and release signing/attestation gates are unchanged.

New actions reuse the earlier downloader's credential stripping on redirects,
HTTPS host allowlist, fixed hashes, bounded size/time, safe archive extraction
and atomic publication. Downloads remain inside RUNNER_TEMP. No CodeQL is
restored, no runner classes/permissions/secrets are widened, and public PR trust
boundaries are unchanged. Lumen's separate current-scanner policy is unchanged.

Local validation: all three actual action scripts pass; Gradle's real wrapper
prints 9.6.0 on Java 17 using the pinned local archive; Cosign prints `Verified
OK`; Trivy prints 0.74.0. Fifty-two workflow/security contracts pass, including
nine existing downloader safety cases and ten new wrapper-transport safety
cases. Full CI's native bootstrap job now also validates these actual tools.
Hosted validation of this new revision remains required before release.

Evidence and verified reusable tool caches are retained on kspld0 beneath
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/`
and the matching task-cache directory. Relevant logs are `release24-*-failed`,
`release24-*-attempt2`, `setup-*-actual-replay`, `gradle-wrapper-actual-version`
and `release-bootstrap-contracts-final`. This recovery is a later workflow
revision; rerunning the old release would execute its old bootstrap code.
