# Backlog, local-change and scanner verification — 2026-11-09

## Scope and live inventory

Starting source: main `e577526351ecdc630beb8d6697b4f02a60cc6d50`.
GitHub returned **zero open PRs**, two open issues (#625 and #629), and **zero open
Dependabot, code-scanning and secret-scanning alerts**. No PR was closed or
discarded to achieve that count. No new third-party patch was pending review.
The previous security remediation record remains
[the source audit](security-audit-remediation-2026-11-09.md).

The four dirty primary-worktree files were saved as a binary patch and applied
three-way to current main. Their policy corrections were already integrated or
superseded by main's more detailed hosted-runner, native-platform, release-input
and attribution guidance. Conflict review retained those newer details. No user
change was silently dropped; none of the four needed a duplicate/empty commit.
The primary checkout was advanced to main and cleared of those old edits.

## Current security checks

- Semgrep CE **1.184.0**, current `p/default`, metrics off: 611 rules across
  7,841 tracked files. **54 findings, zero unreviewed/changed/expired findings**
  under the existing exact-file/hash/rule/count review. Its 97 parser/engine
  diagnostics and skipped files remain in the report; this is not complete
  language coverage. No exception or suppression was added. The subsequently
  changed deepmerge test was rescanned separately with zero findings/diagnostics.
- Trivy **0.76.2**, filesystem scan of vulnerabilities, misconfiguration and
  secrets, no repository config/ignore overrides: **zero fixable HIGH/CRITICAL
  findings**. This uses the repository's production dependency policy and
  `--ignore-unfixed`; it does not establish absence of lower/unfixed findings.
- `pnpm audit` still reports **one LOW advisory**, GHSA-gcqx-w48m-w2h4, against
  deepmerge 4.3.1 via `@svgr/webpack → @svgr/plugin-svgo`. Its package-version
  detector cannot account for SeerrNG's existing lockfile-bound local patch.
  Both 2.2.1 and 4.3.1 remain patched. Added that exact SVG consumer to the
  existing prototype-poisoning regressions across its CJS, UMD and ESM entries,
  alongside email rendering and Formik. The tests verify both merge operands,
  nested values, null-prototype inputs and normal merges. No audit warning was
  hidden and no unsupported dependency version was invented.
- Focused security regression suite: **45 tests across 11 files passed**.
  Deployment/scanner gates plus deepmerge consumer regressions: **46 passed**.
  Historical file-security, log-reader, mapping, URL and user-setting regressions:
  **191 tests across seven files passed**.
- Full production build passed. CodeQL invocations remain absent under the
  owner's disable directive. CodeQL was not re-enabled or claimed to have run.

## Historical CodeQL dismissal check

The historical API inventory contains 178 dismissed records: 120 false positives,
42 “won't fix,” 15 test uses and one mitigated record. These counts do not mean
178 fresh vulnerabilities or prove that every historical dismissal is correct.
The generic historical “accepted risk” comments were checked against current
source rather than treated as sufficient resolution:

| Alerts | Current source evidence |
| --- | --- |
| 100 / 99 | The unused bulk pagination initializer is gone; MiniQuotaDisplay uses the direct `!data` loading guard. |
| 98 / 97 | Log/settings readers open once with no-follow protections, validate the descriptor and read the same descriptor. |
| 96 / 95 | Private image-cache reads use descriptor checks; writes use bounded validated images, private paths and exclusive creation. |
| 88 | Trailing slash removal uses a bounded index loop, not the flagged polynomial regex. |
| 87 / 86 / 85 | Shared authenticated route limiting covers account-link and author routes; current mutation authority checks remain in place. |
| 52 | The disabled smoke workflow now has explicit read-only permissions and pinned checkout, with credentials disabled. |
| 49 / 48 | Duplicate-detector requests use fixed Groq/GitHub origins; file text is request body content, not an arbitrary destination. |
| 46 | Anime mapping reads validate and read the same no-follow file handle; downloads are bounded and atomically replace a private temporary file. |

The other “won't fix” records include test-only cookies, structured TVDB logging,
Subsonic's required token hash and the deliberate trusted-LAN HTTP opt-in. Their
existing compatibility/transport choices are not silently changed in this pass.
No historical alert was newly dismissed to make the live count zero. Native
code, actual user-cookie transport and protocol compatibility retain the
verification limits in the source security audit.

## Issue #625: actual library and details

The root fix is on main in `cb9b89860`; follow-up PR #630 is genuinely merged in
`83a9ddd3c99904bdfcceb4a3e2b3bef4ddb8b00f`. Current production code was stood up
with a separate SQLite copy and a read-only Chaptarr contract fixture modeled on
Martian, Threshing Day, Wool and Fourth Wing, plus 260 additional owned titles
per format. No household database or provider was modified.

At 390×900 and 1440×900, Lumen's actual **Books/Audiobooks → In library** displayed
all reported cases and the final additional title after pagination. Library API
readback returned 263 audiobooks / 262 ebooks. Owned detail pages showed disabled
**In your library** actions without an owned-format request button. Attempting
a duplicate ebook request returned **409** with the destination-already-owned
message and no provider writes. Native book detail routes also passed for all
four identities in SeerrOrig, SeerrNGJ and PersiusNG at both widths: 24 states,
no browser page errors or horizontal overflow. Representative captures were
visually inspected; this is not a full native page/style audit.

## Issue #629: actual routing and settings

The correction is on main in `cb9b89860e8c6aa088df081b90bac416794bc1d8`;
`9a6f0386133ed98ceb545f8ff991f605a4178cb6` repairs the later stylesheet race.
The current production app passed `playwright/lumen-default-entry.spec.ts` at
390 and 1440 pixels with real synthetic login sessions. Upgrades enter native;
pre-auth Lumen visibly links to full SeerrNG; explicitly selecting Lumen changes
root entry; friend-account native/Lumen switching, logout, theme restoration and
bundled manifest/icons work.

Actual **Settings → General → Default Interface** was exercised at 390, 768,
1024 and 1440 pixels in Orig, John and Persius: the controls remain visible;
changing to the configured companion saves and reads back its URL; root sends
the browser to that address; `/seerrng` restores native access; included/native
selection persists; credential-bearing or unsafe companion URLs return 400.
The separate companion's preferences/branding were not imported or replaced.
This is the corrective routing behavior, not a claim that the separately
[tracked automatic Lumen migration/import roadmap](lumen-single-container-remaining-work.md)
is complete.

## Resolution receipts

After the implementation/UI checks and verification commit were pushed to both
main remotes, the two known-fixed issues were closed as completed with explicit
source-versus-release status:

- [#625 resolution comment](https://github.com/snapetech-org/seerrng/issues/625#issuecomment-6755764704).
- [#629 resolution comment](https://github.com/snapetech-org/seerrng/issues/629#issuecomment-6755765394).

No unsupported public-image claim or blanket closure comment was used.

## Delivery and evidence limits

The fixes above are verified **on main**. The latest public release checked in
this pass is **v3.72.27**; v3.72.28 remains a withheld draft and no v3.72.29 release
was published by this pass. Closing a known-fixed issue against main must state
that distinction and must not tell users the old public image contains the fix.

Evidence on kspld0:
`/mnt/disks/scratch/task-deliverables/seerrng-backlog-security-20261109/`.
It retains issue bodies/comments, alert snapshots, raw scanner/audit results,
regression/build logs, screenshots and browser reports. Fixture schema was
synchronized in an isolated copied SQLite database and migrations/periodic jobs
were disabled. This is source UI/API qualification, not migration, live-provider,
physical-device or replacement-release-image certification.

Initial scanner attempts used an old host Trivy and a worktree without mounted
Git metadata. They are excluded; the authoritative files are
`trivy-qualified.json`, `semgrep-qualified.json`,
`semgrep-baseline-qualified.log` and `semgrep-final-test-change.json`.

release-note: none
