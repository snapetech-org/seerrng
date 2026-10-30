# Native recording and future-season requests

These flows belong to SeerrNG. Theme packages change their CSS and composition;
they do not ship executable request logic or require a UI-rewriting proxy.

## Recording choices

`GET /api/v1/editions/book` accepts `format`, `mediaId`, canonical `bookId`,
`term`, expected `title`/`author`, and optional `foreignBookId`. A Bookshelf work
identity selects its configured service and exact provider work. Other catalog
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
cancellation and updates only the corresponding service targets.

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

## Validation boundaries

Focused tests exercise actual components and provider adapter methods with mocked
external transport, plus validation and ownership helpers. Migration SQL is
round-tripped against SQLite. The full production Next.js build, PostgreSQL
migration, real provider acquisition/playback and concurrent multi-user flows
still require a running deployment. See [PersiusNG evidence](persiusng.md).
