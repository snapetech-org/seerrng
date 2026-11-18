# Picomatch dependency verification, 2026-11-18

Two Dependabot alerts tracked
[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).
[Alert 386](https://github.com/snapetech-org/seerrng/security/dependabot/386)
tracks the root lockfile. [Alert 384](https://github.com/snapetech-org/seerrng/security/dependabot/384)
tracks the documentation lockfile. GitHub withdrew the advisory on
November 18 and now reports both alerts as fixed. The advisory has no
patched registry version. The [upstream maintainer's disposition](https://github.com/micromatch/picomatch/pull/235#issuecomment-6315749381)
describes these patterns as caller-controlled regular expressions.
The local patches remain in place.

[Commit 8e7c32eab](https://github.com/snapetech-org/seerrng/commit/8e7c32eab)
adds a local mitigation for repeated wildcard extglobs. The root workspace
pins its patch for 2.3.2. The documentation workspace pins patches for
2.3.2 and 4.0.4. Verified that all three workspace declarations and
lockfile package snapshots reference the SHA-256 digests of the checked-in
patch files. The two 2.3.2 patch files are byte-identical.

Both patches applied cleanly to fresh npm tarballs of the exact pinned
versions. Ordinary matching checks passed for globstar paths, file
extensions, and bounded extglob alternatives. These checks verify patch
binding, applicability, and basic compatibility. They do not establish
that a previously installed dependency tree includes the patch. Release
validation must use a fresh frozen install and verify the patch in the
resulting dependency tree.

Fresh frozen installs of the root, documentation, and production-only
dependency graphs also passed with pnpm 10.24.0. Lifecycle scripts were
disabled for this dependency check. Readback of the installed parser
confirmed the mitigation in root and production Picomatch 2.3.2 and in
documentation Picomatch 2.3.2 and 4.0.4. The production Dockerfile copies
the patches before its frozen installs. Verification of a built release
artifact remains pending. Install logs and readback are retained in
`/mnt/disks/scratch/task-deliverables/seerrng-picomatch-frozen-20261118/`.
