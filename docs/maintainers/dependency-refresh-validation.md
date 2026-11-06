# Dependency refresh validation

This follow-up recovers the original histories of PRs #567–#571. It is separate
from the v3.72.10 tag. PR #573 merged into main at
8b47a4238d9fe4729efb54c034b0888ebf040098 after full CI 42158970687 passed
on exact head ca5766128b8f95975b12799593e45924704ea73d. All five original
PRs are GitHub MERGED, with their final heads preserved in main ancestry.

## Repairs and provenance

The batch updates the ICU parser to 3.5.22, mime to 4.1.2, Next and its analyzer
to 16.4.3, and Nodemailer to 10.3.1. Package-only Next and Nodemailer updates were
masked by the existing workspace overrides. Both override pins and the lockfile
now select the requested versions, including matching native SWC packages. The
old Nodemailer release-age exception was removed; the normal age policy remains.

Official upstream release notes and package repository metadata were inspected:

- [Next 16.4.3](https://github.com/vercel/next.js/releases/tag/v16.4.3) contains
  backported font, proxy runtime, tracing and standalone-bootstrap fixes.
- [Nodemailer 10.3.1](https://github.com/nodemailer/nodemailer/releases/tag/v10.3.1)
  corrects OTP option handling in MailComposer; the application does not add an
  OTP header as part of this dependency update.
- [mime 4.1.2](https://github.com/broofa/mime/releases/tag/v4.1.2) prevents callers
  from mutating shared extension results.
- [ICU parser 3.5.22](https://github.com/formatjs/formatjs/releases/tag/%40formatjs/icu-messageformat-parser%403.5.22)
  permits shared date/time arguments.

Full CI caught an additional AppImage packaging mismatch: its WASM compiler
allowlist still stopped at Next 16.4.2. The matching 16.4.3 compiler now has an
explicit official registry SHA-512 pin; older release versions remain supported.
The release contract checks the new pin rather than weakening its version check.

## Validation

A separate persistent dependency cache was installed with a repaired frozen
lockfile. Installed package metadata confirms all five versions. Installation
scripts were ignored, and the existing native SQLite binding passed a real
in-memory query probe. The existing dependency cache was preserved.

Production build, six mail/encryption cases and all five prototype-pollution
regressions pass. Production audit reports one low finding and zero moderate,
high or critical findings; the existing tested dependency patch remains in place.
The version-based alert has not been dismissed.

Six headless browser cases cover profile, General, Users and Services in all
three themes at 390×900 and 1440×900. All pass without horizontal overflow.
Twenty-three of 24 top-viewport captures are byte-for-byte identical in decoded
RGB pixels to the preceding baseline; one differs by a maximum of one channel
level. This comparison establishes the captured settings layout, not all routes
or live provider interactions. No live SMTP account or notification was used.

Logs, source patches, package metadata and image comparison records are retained
in `/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`
under `dependency-refresh-*` and `dependency-pr-source/567` through `571`.
The final CI and merge receipts are dependency-refresh-final-ci.json,
dependency-refresh-merged.json and dependency-refresh-original-merge-receipts.json.
These changes require a subsequent release; the immutable v3.72.10 tag excludes
this follow-up.
