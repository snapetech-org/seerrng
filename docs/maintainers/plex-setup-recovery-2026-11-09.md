# Plex setup recovery — 2026-11-09

## Scope and cause

The supplied screenshots match native SeerrNG SettingsPlex and Setup. BookshelfNG and ChaptarrNG are outside this change.

Setup's validateLibraries callback depended on the object returned by useToasts, which was recreated on every render. A response updated the enabled-library-name array, causing another render and another validation request. Once the server limit was reached, library writes and validation could fail together.

The hook now retains a stable API and validation depends only on the selected media-server type. A failed validation keeps persisted selections and exposes an explicit read-only retry. Library writes publish their confirmed response into SWR before controls become available again.

## Connection selection

The primary selector represents server identities, with deduplicated alternatives inside an advanced disclosure. Recommendations require a successful probe. Reachable private LAN routes precede possible container gateways, remote addresses, link-local addresses and loopback; HTTPS wins between comparable routes. IPv4, IPv6 and Plex-encoded hostnames are classified. No certificate checks are disabled.

Only a blank connection form is populated automatically, and a delayed discovery response re-reads the current draft before applying a recommendation. Failed refreshes retain the previous discovery data.

## Rate limiting

A browser Axios interceptor records same-origin API 429 cooldowns. Retry-After accepts seconds and HTTP dates, accounting for a server Date header. Missing or invalid headers default to 60 seconds; zero or past dates have a one-second minimum. Long waits are retained while individual timers respect the runtime timer limit.

During the cooldown, reads and writes fail locally. They are not accumulated for later replay. SWR read retries are bounded and wait for the cooldown. Ordinary authorization/client errors are not automatically retried. Mutations require an explicit user retry.

The notice uses existing message, button, settings-row and disclosure owners. No CSS or theme values are introduced.

## Observed validation and interrupted acceptance

Before the execution environment became unavailable:

- The focused API cooldown, connection ranking, toast and Setup validation run passed: four files, twelve tests.
- Matching baseline and candidate Settings/Plex renders were captured at 390 × 900 and 1440 × 900 in seerrNGJ and seerrOrig. The candidate reduced the fixture's repeated endpoints to one server choice, selected the private LAN address and reported no page errors or document overflow.
- Phone inspection identified excessive primary-option text. The final label uses the server name, with the recommendation explanation in the existing description role.
- The broad Vitest/tooling runs and the new browser interaction suite did not complete successfully before environment access failed. Browser tests were observed failing, but their final diagnostics were not recoverable.
- The final source was reconstructed from the recorded edits against the same unchanged application base through the GitHub connector. Formatting, full typechecking, production build, browser interactions and final-source visual acceptance remain unverified.

This record is a checkpoint, not release acceptance. The recovery branch must pass the applicable repository checks before being promoted. Live Plex provider connectivity and a production deployment were not tested.
