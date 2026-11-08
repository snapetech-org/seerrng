# Lumen image publication

`lumen-release.yml` packages a published stable SeerrNG tag as
`ghcr.io/snapetech-org/seerrng-lumen:<tag>`. It also updates `latest` when that
version is still GitHub's latest published stable release. Version publication
runs independently from alias refreshes so a newer pending alias cannot cancel
an older version build. The normal SeerrNG release is published by `GITHUB_TOKEN`, whose release events
do not start another workflow. `lumen-release-dispatch.yml` therefore handles a
successful `SeerrNG Release` completion on trusted main, verifies the published
stable tag against that completed run's source, and explicitly dispatches this
publisher. It rejects fork/PR/alternate-branch events, draft/prerelease metadata
and source mismatches, consumes no artifacts from the triggering run, and avoids
duplicating an active or successful named publication. See
[GitHub's token event rule](https://docs.github.com/en/actions/concepts/security/github_token).
Direct human release publication remains supported by the existing release event.
Use the manual entry point for bootstrap or recovery:

```sh
gh workflow run lumen-release.yml --repo snapetech-org/seerrng --ref main -f tag=vX.Y.Z
```

The source tag must be on main, have the matching package version, be a public
stable GitHub release, and have successful exact-commit Lumen validation. Native
amd64 and arm64 hosted runners each install/audit dependencies and run the real
production-nginx tests. Packaging adds release labels; its root filesystem must
match the tested exported image exactly. The exact packaged image is scanned
before registry authentication/publication. The job receives no provider or
household credentials.

Native version tags are reused only for the same source revision and architecture;
they are never overwritten for another source. The version manifest is reused
only when both immutable child digests match. Publishing requires an anonymous
manifest read before `latest` can move. A newly created GHCR package may need its
package visibility set public before this gate succeeds; repair that package
setting, then retry the same tag instead of rebuilding another release version.

Do not switch the supplied Compose defaults to this image until the first public
version and both architectures have been verified. The initial bootstrap is
tracked in #598. New workflow source requires live validation on its selected
native runners; local actionlint is only a syntax/contract check.

The v3.72.22 app candidate and its exact CI SHA remain separately recorded; adding
this publisher does not move that candidate tag or change its app sources.
