# Book identities in request UI — November 8

[#53](https://github.com/snapetech-org/seerrng/issues/53) was reopened after the
actual human workflow reproduced empty skeletons in `/users/1/requests` even
though the main Requests page rendered book titles. Two gaps remained:

1. Request rows/cards and issue summaries selected only Open Library identifiers.
   Valid scoped Bookshelf/Chaptarr identifiers therefore produced no metadata URL.
2. Profile `/api/v1/user/:id/requests` called the shared relation hydrator without
   opting into identifiers. Its response lost identities that the list/status
   APIs already returned, so profile cards still failed after fixing the selector.

The existing path utility now owns `getBookRouteId`, shared by Current Requests,
legacy request rows, profile/recent-request cards and issue summaries. It retains
Open Library normalization and case-sensitive scoped Bookshelf IDs, including
service zero. It preserves existing alias order and does not invent a service
identity from bare backend-local IDs. Existing path-segment encoding remains.
The bounded request hydrator includes identifiers by default while preserving
its explicit opt-out, query batching, viewer projection and authorization.

## Evidence

- Baseline `60d54c949`: four real-browser cases fail on legacy rows in Orig/John
  at 390/1440. Request-list API responses demonstrably contain identifiers.
- Frontend-only candidate repairs legacy rows; profile then exposes the separate
  missing-identifier API response. Both failures and traces are retained.
- Final production build and compiled server: four actual UI/API/SQLite/HTTP
  fixture workflows pass across Current Requests, legacy history and profile
  recent-request cards, with reload and readable titles for three prepared
  ebook/audiobook requests. No provider response is replayed in this sweep.
- `server/routes/user.test.ts`: 121 pass, no skips or external network access,
  including two new actual database/HTTP profile-identity regressions. Acquisition
  enqueue is stubbed for those identity-projection fixtures, as in existing tests.
- `src/utils/apiPath.test.ts`: four passes for Open Library normalization, scoped
  service-zero identity, encoded payload preservation, alias order and refusal
  to turn unscoped backend IDs or unrelated identities into book routes.
- `playwright/book-request-identities.spec.ts`: four passes, Orig/John 390/1440,
  covering legacy history, profile cards and issue summaries with explicit
  bounded API replays. It verifies readable titles, encoded detail links and
  horizontal non-overflow. This is a maintained rendering regression, separate
  from the actual API/database sweep above.
- Full production build/prebuild contracts, server compile and focused lint pass.
  No CSS, theme geometry, typography, palette, spacing or page dimensions change.
  Matching viewport captures confirm existing request-row/card composition and
  distinct themes; Current Requests remains a representative shared consumer.

Evidence root on kspld0:
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/`.
See `book53-human`, `book53-human-candidate`, `book53-human-final`,
`book53-maintained-accepted`, `book53-user-route-qualified.log`,
`book53-identity-native.log`, `book53-build.log` and
`book53-resolved-history-contact.png`. Full-page captures taken after scrolling
can place fixed chrome partway through the stitched image; that is a capture
artifact, not a changed header position.

Early harness failures used incomplete service-error arrays or omitted the year
from the issue-title expectation. Phone tests also needed to scroll the history
and profile slider to trigger intended lazy metadata loading. These fixture/test
corrections required no production changes. The read-only Chaptarr fixture does
not implement book-file downloads or unrelated ComicVine/Plex data; those log
errors are excluded from this identity/rendering qualification. Existing prepared
request/media IDs and provider copies are preserved; no real acquisition occurs.

Keep #53 open until the replacement artifact is published and verified. This
milestone does not complete all 73 historical human workflows.
