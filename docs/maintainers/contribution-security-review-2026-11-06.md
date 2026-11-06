# Contribution recovery and security review checkpoint

This records verified recovery and security evidence on November 6, 2026. It
separates source review, tested repairs, merge delivery and release publication.
It does not certify every upstream package, historical stylesheet, live provider
or physical device.

## Recovery of the original 75 closed PRs

A fresh GitHub reconciliation found 70 PRs marked merged. Every latest head was
independently verified as an ancestor of main at
`efc3ec890e3c151f87446a4da03a3235328a1830`; subsequent merges preserve that
ancestry. Five remain closed because their implementations were superseded:

| PR | Superseding implementation |
| --- | --- |
| [510](https://github.com/snapetech-org/seerrng/pull/510) | Merged PR527 preserves provider-scoped Bookshelf book identities and dispatch IDs. |
| [509](https://github.com/snapetech-org/seerrng/pull/509) | Merged PR515 normalizes Audiobookshelf test and save ports to numbers. |
| [508](https://github.com/snapetech-org/seerrng/pull/508) | Merged PR514 restores missing UI/OpenAPI routes and contract checks. |
| [497](https://github.com/snapetech-org/seerrng/pull/497) | Current Node24.22.2 runner/container pins match the application engine. |
| [496](https://github.com/snapetech-org/seerrng/pull/496) | Commit 72fee548a hardens both deepmerge operands across shipped CJS/ES/UMD entry points. |

The named Lumen contributor commits 676768f, 835c271 and 8e95d48 are also ancestors
of main. A closed PR alone was never accepted as proof of implementation.

## Review scope and findings

The [per-PR review ledger](evidence/2026-11-06-contribution-security-review.json)
contains all 54 historical human contribution reviews, source-patch SHA256s and
scoped dispositions. Separately, 144 dependency-bot PR diffs and the historical
CodeQL/Trivy alert records were reviewed. Dependency-diff review is not an
exhaustive review of upstream package source. CodeQL remains disabled.

Confirmed findings repaired during recovery include mutable-name Bindery
requester ownership, Lumen shared search history/storage failure, cancelled Plex
sign-in completion, companion proxy session admission, and playback authority
retained across asynchronous provider lookups. The playback regression returned
200 in all six revoked-authority playlist cases on baseline; its repair passed
60 focused account/provider/selection cases. See
[playback authority validation](https://github.com/snapetech-org/seerrng/blob/7b8f9d6267aa8741fd3ae1258ae11e687cb4b234/docs/maintainers/playback-authority-validation.md).

The fresh Semgrep 1.184.0 scan of candidate 7b8f9d626 reported 51 contextual matches
across 7,529 tracked targets, with approximately 99.9% parsed lines. It skipped 240
oversized files and 878 ignored test/fixture paths. Structured follow-up covered
all 51 reported matches without parse errors. These were reviewed as archived
review tooling, repository/private-cache path operations, escaped metadata
patterns, validated settings mutations, or generated application email links.
No additional active exploit was confirmed within those stated boundaries. No
scanner suppressions or ignore patterns were added to eliminate these reports.

Trivy initially reported HIGH DS-0002 for Lumen's root nginx master. PR585 now
runs the production image as nginx, with static assets read-only and the needed
configuration/cache/PID paths writable. Both deployment templates drop all Linux
capabilities and forbid new privileges. Tests now build the actual production
image and verify nonzero process UID, static frontend/CSP, forwarding trust and
companion session admission under those restrictions. All 12 proxy/native-link
cases and 36 desktop/phone/tablet browser cases passed. The subsequent Trivy scan
reported zero findings under its HIGH/CRITICAL, ignore-unfixed scope; this does
not mean zero advisories of every severity.

Two LOW deepmerge upstream advisories remain visible without an upstream fixed
release. The shipped local hardening and regression checks remain in place;
these alerts were not falsely dismissed as resolved upstream.

## Validation and delivery boundaries

PR582 merged after full hosted CI: 4,619 native checks passed, five intentional
native skips, and 278 browser cases passed with one intentional custom-theme
package skip. PR585 merged after its production-image, dependency-audit and
browser checks, plus the Trivy rescan.

PR584 prepares v3.72.12 and includes the playback and localization packaging
repairs. Its local production build, 60 focused authority checks, 179 additional
boundary cases and 278 browser cases passed. Its full hosted validation and
release publication are separate delivery gates; verify their live state before
claiming this checkpoint is a published release.

The v3.72.11 attempt remains an unpublished draft: Windows inventory ordering
and missing Docker localization inputs blocked publication. The repaired Docker
context contains exactly the ten authored localization JSON files; a real
context export also excluded operator and unlisted-locale test markers. It does
not include operator settings, databases or logs.

Full source-review records, raw scans, per-finding context, original 75 PR
ancestry reconciliation, issue dispositions, baseline/candidate logs and browser
captures are retained in the owner's
`seerrng-contribution-recovery-20261105` task-deliverables archive. These evidence
files are not credentials or a production configuration backup.

## Incoming contribution #589 follow-up

The original 54 historical records are retained. A 55th scoped review covers
ncbudd's incoming Jellyfin/Emby contribution #589 at
`945de885e17e987a7d7e49ae2c7d8409c01e636e`, received during the later user-report
repairs. Preserve its ancestry and features while hardening configuration-key
validation, recovery URL credentials/path handling, public-settings failures,
and cancellation/single-flight boundaries. Its own tests remain alongside the
added regressions. See the ledger entry and
[user-report validation record](user-bug-reports-2026-11-06.md) for scope and
current validation; this addendum does not change the earlier release checkpoint.
