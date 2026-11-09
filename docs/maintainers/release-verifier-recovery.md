# Recover a verifier failure after completed release builds

The release verifier must check out `.github/actions` at the workflow revision
before using the local GitHub CLI and Cosign actions. Their shared verified
release-asset downloader must be present at its sibling path. Checking out only
the CLI under `.github-actions` cannot provide a root-relative Cosign action.

When all native builders, image scans, signing, and asset upload have succeeded,
a verifier failure can be recovered without moving the tag, replacing the image,
or rebuilding those assets. Dispatch `release.yml` from current main using the
same tag, `reuse_from_run_id` for that failed run, and
`reuse_published_image=true`. The existing optional-channel inputs remain explicit.

The classifier requires the previous run to be completed and failed, from this
repository's release workflow and matching tag, with source ancestry on main.
Every required native builder, scanner, signer and asset upload must have
succeeded; all mandatory artifacts must remain unexpired. Only a sole verifier
failure or a sole package-dispatch failure is supported. Earlier inline branches
for partially built platforms were unreachable behind the completed-assets guard
and are removed. A failed native job must be repaired or rerun on its original
source before this post-build recovery can qualify.

A targeted job retry is reconciled using the newest executed result for each job;
a cached skipped result cannot hide a failed execution. Verifier recovery reuses
the revision-checked published image and repeats Cosign signatures, GitHub build
provenance, and both platforms' CycloneDX attestations. Package dispatch and public
release publication require this fresh verifier to pass. Image rebuild, rescanning
and resigning are omitted only because the original matching stages are required
to have succeeded. Native assets remain the previously checked uploaded files.
Stable aliases and announcements follow the recovered public-release gate.

The Lumen handoff checks that the published tag's exact commit is contained in the
completed trusted-main release run. A workflow-only recovery may have a newer
workflow commit than the immutable application tag; its ancestry must still pass.
The existing Lumen publisher independently requires successful validation for the
exact tagged application source.

The regression suite checks positive recovery, every missing stage/artifact,
expired artifacts, wrong repository/workflow/tag, multiple failures, targeted
retry precedence, action-checkout availability and fresh-verifier publication
gates. Live runner verification remains part of each changed workflow milestone.
