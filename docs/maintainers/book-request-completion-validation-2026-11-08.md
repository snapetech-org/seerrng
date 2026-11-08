# Book handoff, completion and notifications — November 8

[#611](https://github.com/snapetech-org/seerrng/issues/611) was found while testing
[#610](https://github.com/snapetech-org/seerrng/issues/610) through the real UI.
Successful book handoff unconditionally saved `COMPLETED`, even when Bindery
returned pending/unfulfilled with no book ID or imported files. This queued a
false availability notification intent. The Requests status projection already
showed Searching correctly; this was a persisted lifecycle/notification defect,
not evidence that the earlier screenshot's badge displayed Available.

Delivery now retires its durable dispatch attempt independently of completion.
Book requests remain approved until the shared requested-file predicate confirms
the selected formats/recording. Existing tracking prevents duplicate handoff for
the same destination, format and provider recording; automatic metadata edition
IDs retain their existing semantics. Recovery skips requests already owned by
file/search tracking before applying its batch limit. Existing tracking workers
publish observed files and complete requests normally, including both formats
and explicit recording selection.

Active tracking created by old dispatchers repairs premature completion under
the existing request admission lock when requested-file evidence is absent.
The correction does not enqueue another approval or delivery attempt. Notification
intent hydration also retires old book availability intents without requested
files, following the existing comic boundary. No database migration, schema,
permission, service-key, theme or CSS change is introduced.

## Qualification

- A new native assertion fails on the baseline: the real HTTP Bindery pending
  response leaves the stored request at 5 instead of 2. The application log also
  records the premature availability intent. Four matching human baseline cases
  reproduce that persisted result at Orig/John 390/1440.
- 404 native lifecycle tests pass, zero skips: subscriber dispatch, tracking,
  notifications, durable outbox, media observation, status reconciliation and
  request routes. Cases cover pending ownership, duplicate handoff, Bookshelf
  automatic editions, both-format partial failure, legacy normalization, stale
  intent rejection and exactly one notification after file observation.
- The production build, prebuild checks, i18n check and focused ESLint pass.
  API message regeneration changes source-line fields only; IDs, wording,
  hashes and locale catalogs remain identical.
- Four real UI/API/SQLite/HTTP candidate cases pass in both themes at 390/1440.
  An administrator uses Add Bindery, typed port, Test connection, explicit account
  mappings, Save and reload. A normal mapped user creates the real request;
  the application's actual outbox posts to the isolated Bindery fixture. The
  stored request stays approved, tracking is pending, and no availability intent
  exists. The compiled tracking worker then reads a simulated imported inventory;
  the UI changes to Available after reload, history completes and exactly one
  real local webhook contains the readable book title. A repeated scan sends no
  additional notification. The fixture has no real acquisition/file downloads.
- The local webhook test uses the existing private-notification opt-in only in
  its task helper process. No production URL policy is changed. The initial
  attempt correctly rejected the loopback URL without that opt-in; this was a
  harness setup error. Earlier harness errors expected a checkbox rather than
  the existing pressed button, and expected 204 for a settings DELETE that
  correctly returns 200. Their traces are retained separately.
- The actual compiled recovery query passes on a fresh PostgreSQL 16.15 task
  database: an older tracked request is skipped and the untracked request is
  selected with limit one. This uses the real migrations, entities and query;
  only acquisition enqueue is captured. Initial fixture attempts omitted migration
  execution and selected the wrong CommonJS export; those failures do not describe
  product defects. Existing PostgreSQL QA databases remain untouched.

Matching request captures were inspected for status transitions, geometry,
alignment, typography, overflow and theme composition. Existing layout is
preserved. Retained evidence on kspld0:
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/`,
including `book611-baseline-native`, `book611-human-baseline`,
`book611-lifecycle-native`, `book611-human-qualified`,
`book611-real-postgres-accepted`, `book611-production-build`, `book611-lint`,
`book611-i18n` and `book611-pending-to-observed-contact.png`.

Keep #611 open until a containing release is published and verified. The current
v3.72.25 candidate is still untagged. This milestone does not complete the whole
historical human-workflow audit.
