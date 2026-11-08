# Book language policy and collection workflow verification

This checkpoint continues issues602 and500. It does not complete the73-issue
human-workflow audit, and does not resolve the incoming605/606 provider-latency
and upgrade-ownership reports. Those require separate fixes and evidence.

## Book language restriction

The Open Library wildcard/query repair is published in v3.72.23. The remaining
602 feature adds an opt-in administrator language list under Settings > Metadata
Providers, using the existing form, feedback, settings-save and help owners.
Empty preserves unrestricted behavior. The administrator API bounds, normalizes
and validates language codes and enforces administrator writes. The video/music
metadata settings keep their existing contracts and values.

Search/discovery add an allowed-language provider clause and filter unknown or
disallowed returned books. Open Library retains its bounded language field;
Bookshelf catalogs normalize work/edition metadata. The server verifies an exact
provider edition before admission and pins an allowed match when the requester
leaves selection automatic. Work-level translations or client assertions do not
permit an explicitly disallowed edition. Dispatch rechecks the provider's current
edition language. Restricted both-format requests must be made separately;
Bindery and ReadMeABook, which lack destination edition-language verification,
fail closed under this optional policy. Existing owned library files are retained.

The settings form has independent dirty/submitting state and participates in the
shared page Save action. Initial GET failure shows Retry without mounting defaults;
failed PUT retains draft and Save, and repeat Save/reload/clear persist through
the actual isolated API. No CSS, Tailwind or local geometry override was added.

## Collection issues found during real workflow testing

A real metadata timeout exposed an uncaught server-rendered collection request.
The page now hands failed initial loads to the existing client feedback owner,
which shows Retry for transient failures and retains404 for missing collections.
The caught Axios object, including internal request headers, is no longer thrown
into Next's generic500 rendering/logging path. Existing successful SSR data stays.

Four baseline browser cases also reproduce a progress-poll defect: the dialog's
three-second refresh was suppressed by the global30-second deduplication interval.
The dialog now disables that deduplication window. All four matching Orig/John,
390/1440 cases update watched/requested progress within the polling interval.
The metadata page's mobile selector also retained a stale initial index after
permission-dependent routes loaded. Its value now follows the current visible
route, and blur no longer repeats navigation. A real phone flow verifies Metadata
Providers -> Users -> Metadata Providers with the correct selected label.

## Bounded validation

Production compilation succeeds. Shared UI contracts/geometry pass73 checks.
Focused API cases cover eight ebook/audiobook admission variants, two settings
admission/persistence cases, discovery filtering, bounded provider language fields,
ReadMeABook denial and changed-language dispatch. Native policy/Open Library/queue
checks pass32; edition/queue API Vitest checks pass12; catalog checks pass14 and
collection SSR checks pass2. This is targeted validation, not a full final-head CI
claim; CI status is recorded separately when available.

Actual production browser checks cover language settings load/save/retry/reload
and clearing in Orig/John at390/1440, four collection failure/Retry workflows,
and four live collection polling workflows. The first language harness looked
for an intentionally hidden form-local button; it was corrected to use the shared
page Save action. One later phone attempt started before the server was ready;
its readiness-corrected recheck passes. Neither was an application regression.

Matched metadata baselines/candidates were rendered and inspected. Both phone
and desktop retain their theme's established form geometry, surfaces, typography,
control alignment and overflow behavior; John remains distinct from Orig.
Collection failure/recovery uses the existing shared feedback roles. No real
household OAuth, physical mobile OS, actual download, SMTP or exhaustive provider
metadata coverage is claimed. Provider and playback fixtures are explicit.

Evidence is retained in the owner's task deliverables under
`seerrng-human-workflow-audit-20261107`: book-language-*, collection-progress-*,
collection-load-recovery-*, collection-progression-* and issue-completion-*.
