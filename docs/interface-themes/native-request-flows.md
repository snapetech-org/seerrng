# Native recording and future-season requests

These flows belong to SeerrNG. Theme packages change their CSS and composition;
they do not ship executable request logic or require a UI-rewriting proxy.

## Recording choices

`GET /api/v1/editions/book` accepts `format`, `mediaId`, canonical `bookId`,
`term`, expected `title`/`author`, optional `foreignBookId`, and optional
`serverId` (including zero). An explicit server selects the configured destination
for that format; exact ownership is evaluated there. Without an override, a
Bookshelf work identity selects its configured service and exact provider work.
Other lookups prefer the configured default service for the format. Other catalog
lookups require the supplied title and author to match. Library responses include
exact edition ownership; ordinary Readarr ownership is inferred only when a
single monitored edition matches and its monitored-edition file total is positive.
Multiple monitored editions need the companion's exact edition catalog.

A recording choice opens the existing book request modal with the original work
ID and an initial edition choice. Submission uses `preferredEditionId`,
`editionPolicy` and `variantKey`. The server rechecks the selected edition against
the resolved destination before allowing a request for another version of an
available work. Service access, permissions, quotas, approval and blocklists
continue to apply. A specific edition must use one format, not `both`.

`alongside` requires the companion's wanted-edition capability. Missing capability
or a missing catalog edition fails explicitly instead of replacing the existing
recording. The request modal explains the replacement policy on providers that
only support one monitored version. The background search and status projection
require the chosen edition's files; an older recording's generic work-level
availability does not complete the new request. Completion preserves concurrent
cancellation through the shared request admission lock and updates only the
corresponding service targets. Saving the full request entity preserves the
transactional notification intent and status-history subscribers. Legacy Open
Library edition IDs remain ISBN metadata, not provider recording identities.

Editing a pending request keeps an exact recording's identity and single format
immutable. Changing its destination revalidates the edition and exact ownership
on that destination, including the alongside capability, before saving anything.
The request and its persisted service targets change together. Server/profile ID
zero and explicitly empty tags are valid values. Legacy ISBN requests and
requests for both formats retain their separate behavior. A failed destination
lookup leaves the original request and targets intact; ownership and request
management permissions still apply.

Optional `sampleUrl` and `editionLabel` pass through from the provider. Samples
accept HTTPS without embedded credentials, are not fetched until a click, and
stop when another recording is selected or the component closes. Missing samples
remain disabled with an explanation. The Recommended label is a local suggestion:
a missing, named, unabridged recording matching the interface language. It is not
a provider rating or an invented edition annotation.

## Future seasons

TV request create/update accepts optional boolean `monitorFutureSeasons`.
Other media types and non-booleans are rejected. SQLite and PostgreSQL migrations
add a nullable column: old null values inherit the configured Sonarr default.

| Preference            | New series                                  | Existing series                 |
| --------------------- | ------------------------------------------- | ------------------------------- |
| `true`                | Monitor future seasons                      | Enable future-season monitoring |
| `false`               | Do not monitor future seasons               | Preserve existing monitoring    |
| Omitted / legacy null | Inherit configured all/none/latest behavior | Preserve existing monitoring    |

Episode Queue and season watch gates prohibit a true preference. The dispatch
worker rechecks current policy before calling Sonarr. A false preference never
unmonitors a series requested by another person or already managed in Sonarr.
New seasons are acquired by Sonarr; this option does not create synthetic SeerrNG
request rows for seasons that do not yet exist.

Sonarr v3 updates the existing series payload. Sonarr v5 reads the complete
series and preserves other fields when updating its future-season preference.
The option is available in the native Persius composition; custom themes can
style `.persius-future-seasons`, its label, description and switch.

## Current request page

`src/pages/requests/index.tsx` renders `components/Requests`, using
`GET /api/v1/request/status` and the per-request status/history endpoints. Persius
uses those same snapshots for its compact rows, status pills, download progress
and actions. Active/Ready/All counts retain the selected owner scope. The default
is the viewer's active requests; explicit All and All Users selections survive
query restoration. The additional filters and authorized management controls
remain available. **Details and actions** opens the existing request details and
history without expanding the compact row. Cancellation uses the native request
DELETE route and its confirmation, authorization and error handling.

## Validation boundaries

Native database/API tests cover recording edits, identity, destination ownership,
request permissions, completion/cancellation, notification history and provider
adapter payloads. The production build and signed-in browser checks also exercise
the actual page components, theme endpoints, saved preferences, recording entry,
season controls and current request status page. Provider transport and catalog
responses are deterministic fixtures in these checks; they do not acquire media.

SQLite migration execution passes. PostgreSQL migration SQL has an executable,
opt-in round-trip test but requires a disposable PostgreSQL URL. Real provider
acquisition, external playback and deployment-specific proxy retirement remain
deployment checks. See the [integration checkpoint](integration-checkpoint-20261030.md)
and [visual evidence](persiusng.md) for exact results and exclusions.
