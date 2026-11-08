# Lumen PR604 review

Reviewed original contributor head `641d0939d63ef1c36be7c0a3bc1a61cadb688f99`
on the v3.72.23 candidate. All seven original changed files were inspected:
sign-in storage/mode selection, service flags, capability probes, settings copy,
documentation and browser fixtures. The original contribution history is retained
in the merge candidate; integration and publication are separate gates.

The remembered value is a validated method enum, not an identity, token or
password. Failed sign-ins do not set it; blocked storage cannot block successful
sign-in. Administrator form style wins, unsupported methods fall back, and a
remembered Quick Connect choice does not initiate a code request. Existing
server authorization, cookie, proxy, CSP and provider URL boundaries are unchanged.
No additional exploit was confirmed within these reviewed surfaces.

Four baseline browser cases reproduced a recovery bug: a temporary503 capability
probe removed a configured console platform and made its Retry unreachable.
The repair filters categories by their configured service first, retaining only
PC games with QuestarrNG and consoles with QuestarrNG or ROMarrNG. Explicitly
configured game catalogs retain a recovery path on temporary503 responses;
403/404 denials remain hidden. Unknown legacy service configuration retains its
prior probe behavior. A separate cache namespace prevents old unconfigured
negative probes from suppressing an explicitly connected category after upgrade.

Four more cases reproduced in-memory probe results outliving the documented
10-minute interval during ordinary in-app navigation. The same owner now checks
both memory and stored timestamps, expires old/future entries, and saves results
only while the pending entry still owns the cache slot. A response arriving after
logout is discarded rather than restoring a signed-out account's data. The prior
regression expected an old-account write; its replacement waits for the403
response and parsing frames, then asserts old data stays absent and the new
account's successful result stays intact.

A separate response-validation hardening rejects malformed administrator masks
before config/branding writes. Baseline accepted a string mask as200 instead of403.
The native and actual-nginx fixtures now cover strings, arrays, fractions and
negative values. Current SeerrNG emits valid numeric masks, so this is not evidence
of an anonymous bypass against the supported backend. All27 final native/image
checks pass, including valid-admin saves and anonymous/non-admin rejection.

Initial Games failures now use the existing ServiceNote error card with one
Retry action, reusing the already-approved empty/card/button roles. The duplicate
pagination error was removed for the first page. Later-page failures preserve
loaded games and retain the existing MoreOnScroll retry. Other ServiceNote
consumers retain their presentation when no retry callback is supplied. No CSS,
Tailwind, local dimension or palette override was introduced.

The first repaired checkpoint passed27 actual production-nginx/native cases
and367 browser cases with13 viewport-only skips. All16 matching remembered-form
captures across light/dark and desktop/phone/tablet projects were pixel-identical
to the original PR. Subsequent feedback-owner polishing adds pagination coverage;
its final production build succeeds and final native/browser checks are recorded
separately. The first administrator-style test used the wrong branded label;
the existing family form correctly labels it Username, and the harness was fixed.
Baseline transient failures are application evidence; runner-instance/test-path
setup errors are not.

Final source qualification:375 browser cases pass with13 intentional viewport
skips,27 production-image/native checks pass, and root style/geometry contracts
pass. The16 final remembered-form pairs remain pixel-identical to baseline.
Matched Games error/recovery captures were inspected in all four projects: one
first-page error with Retry, a recovered result, preserved category controls and
no duplicate pagination message. The cache-expiry regression failed in all four
projects before repair and passes with the implemented deadline. The malformed
permission regression failed200 versus403 before hardening; valid and denied
actual-nginx paths pass afterward. These are local candidate results; exact-head
hosted validation and actual main integration remain separate gates.

Acceptance covers remembered server/local forms, failed/invalid/blocked storage,
admin precedence, unsolicited-code prevention, ROMarrNG-only categories,
permission denial, stale negative probes, first-page Retry and later-page recovery.
Fixtures supply accounts and provider protocol data. No real household sign-in,
ROMarrNG acquisition, physical mobile OS or exhaustive dependency-source review
is claimed. Orig/John application components are untouched by this standalone
Lumen contribution.

Retained evidence:
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/pr604-*`,
including original source patch, failed baseline traces, matching sign-in images,
recovery renders and production-image archive. Main merge and release delivery
must be verified before describing this candidate as shipped.

## Verified main integration

PR604 actually merged on November 8 at03:05:12 UTC as
`068c0ef6c810fa6b22757255ed6f008dc0a04217`, with the original contributor
commit641d0939d63ef1c36be7c0a3bc1a61cadb688f99 as its second parent. Both
GitHub and GitLab main received that commit. Hosted exact-head Lumen validation
[42440589568](https://github.com/snapetech-org/seerrng/actions/runs/42440589568)
passed375 browser checks,13 viewport skips and27 native/image checks. Main's
automatic validation42441205703 also passed. The branch-only root-contract
workflow was skipped, not counted as a pass; the local root contracts passed.
The temporary review branch was deleted after its checks and consumer exited.

These PR604 features are on main for the next release. They are **not included
in v3.72.23**, whose immutable source is d036d9dd126415e3f87880dbb6dd5e9d46d0c5b3.
The [public merge receipt](https://github.com/snapetech-org/seerrng/pull/604#issuecomment-6716690018)
records that distinction. Earlier candidate paragraphs above are historical
checkpoints, superseded for integration status by this section.
