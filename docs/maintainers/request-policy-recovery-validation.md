# Request policy contribution recovery

Recover original PRs #461 (webhook filters), #449 (country and language-profile rules), #489 (pending-edit notifications), and #429 (API contracts) with their Git ancestry. These are useful contributions; they are repaired and integrated rather than discarded. CodeQL remains disabled; #429 introduces no workflow changes relative to its merge base.

## Confirmed failures and repairs

- A pending request edit with notifications enabled returned HTTP 500 because the durable notification outbox rejected the new notification type. Admit the type as a media-request event. A real request-route regression verifies one durable event for a material edit and no duplicate for a repeated no-op. Compare normalized acquisition targets as well as explicit overrides; provider progress and tag order do not count as edits.
- Missing TMDB production-country metadata caused an unconditional `.map` failure. Normalize only valid country entries and allow subsequent rules to match when metadata is absent. Preserve valid zero-valued service and language-profile IDs.
- The strict OpenAPI write contract rejected the new country/language fields. Add bounded nullable definitions to both read and write schemas. Tests exercise the actual authenticated, validated router and reject malformed country codes.
- Bookshelf-only service configuration left the New Override Rule button disabled. Include Readarr data in the existing enable condition and memo dependencies. No CSS or shared geometry changes.
- Repeated webhook substitutions bypassed the intended bounded expansion. Enforce a shared 64 KiB UTF-8 output limit, serialized JSON limit, eight-filter chain limit, and 1 MiB rendering-work budget. Reject invalid expressions before sending. Keep the existing deterministic filter allowlist and network destination controls.

## Validation

Evidence is retained outside Git at `/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`.

- Native integration suite: 288 passed, including request routes, notification dispatch, country routing, and webhook agents. Additional focused checks cover effective destination changes and the rendering-work bound.
- Authenticated OpenAPI integration: 28 passed.
- Production server and client build passed; the final snapshot helper also passed a server rebuild.
- Browser fixtures at 1440×900 and 390×900 cover country/language-profile-zero submission, Bookshelf-only rule creation, and pending-edit notification opt-in. Six candidate cases pass. Matching baseline cases record the prior disabled Bookshelf action and absence of the added controls.
- Baseline regression logs retain the actual country TypeError, OpenAPI rejection, pending-edit HTTP 500, and oversized webhook delivery. Candidate regression tests pass.

Browser provider responses are deterministic fixtures; this does not certify a live third-party notification service. Screenshots use reduced motion and disabled animations so modal transitions do not corrupt the comparison. Desktop and phone comparisons were visually reviewed: the existing modal spacing, typography, form owners, and notification layout are preserved. Added rows extend the existing scrolling forms. Evidence: `policy-stable-rules-review.jpg`, `policy-notifications-top-review.jpg`, and their full-resolution source captures. The final CI status must be recorded before integration.
