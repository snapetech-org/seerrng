# Provider cache contribution #634 review

Original contributor: [@ncbudd](https://github.com/ncbudd),
[PR634](https://github.com/snapetech-org/seerrng/pull/634), head
`378bbddc89751886d4cfd70542a7c0885d6c2f14`.

This useful contribution is reviewed separately from the frozen routing/book
replacement release. It is not included in that release or claimed merged by
this checkpoint. Preserve the original head when integrating the reviewed patch.

## Confirmed repairs

Eight new regression cases failed against the contributed head (51 passed):
explicit deletion of a stale-only key did not invalidate it; late access restarted
the stale age; callers could mutate shared stale objects; fresh and stale entries
had separate budgets; optional cache-directory failure escaped the handler; and
provider 401/403/404 responses were concealed by stale answers.

The patch invalidates stale-only keys, retains original expiry time, returns
isolated copies and shares the existing key/byte budget across fresh and stale
entries. Terminal provider errors invalidate stale data and propagate; cancelled
reads do not return stale. Transient outages retain the intended fallback.
Provider error diagnostics use existing redaction. Random exclusive temporary
files avoid collisions/symlink reuse, optional directory failures are nonfatal,
and shutdown awaits an active periodic snapshot before its final snapshot.

Only the existing public metadata caches opt into persistence. Acquisition,
Plex/account, availability and service caches remain excluded. Cache keys digest
request scope and credentials; no credentials are added to snapshot entries.
TVDB login POST responses remain uncached. Existing authorization, language,
maturity and provider-file evidence policies are not replaced by cached metadata.
These are scoped code-review findings, not a claim of exhaustive upstream
provider-source, physical-device or household-credential testing.

## Validation

All 61 targeted cache/ExternalAPI/persistence tests pass, including cancellation
and removal of stale entries after terminal errors. A three-process check against
a real read-only local HTTP provider verifies restart restoration: the stale
response returned in 751ms while the two-second refresh continued; the next
process reused fresh metadata in under 1 ms with no third provider call. Snapshot
files are mode 0600 and do not contain the synthetic API key. Timing describes the
isolated fixture, not live-provider performance. This backend change introduces
no component, CSS or layout owner.

Evidence is retained in the task deliverables directory
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-routing-permissions-20261109/`,
using the `pr634-` prefix. Full-suite/build, integration and release receipts are
recorded separately when completed; none are inferred from the targeted count.

Local broad qualification: production build, lint and formatting pass; full Vitest
reports 5,260 passed/6 existing skips. Native reports 4,938 passed/6 existing skips;
the subsequent additional concurrent-file-writer case is included in the 61 passing
targeted cases. No production code changed after the broad run began. Source
coverage, English API messages and source fingerprints were regenerated with the
repository's normal tooling; existing translation-review warnings remain visible.
These results qualify the review candidate locally. Main integration and hosted
checks remain separate receipts, and no release publication is claimed here.

The [dated contribution receipts](evidence/2026-11-09-lumen-books-contribution-review.json) preserve original heads and saved source-patch hashes for this batch.
