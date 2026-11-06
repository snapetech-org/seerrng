# Book availability, Lumen access, and rating-bar follow-up

Baseline: main `bae9f515e03a9a5a6ac6decff26170846246c69d`, released as
v3.72.14. These follow-up repairs are additional changes.

## Confirmed causes and repairs

1. The Chaptarr connection help conflated the general administrator key with
   the separately configured restricted service key. Released ChaptarrNG
   v0.9.941 and v0.9.977 authentication/configuration sources confirm the
   literal `CHAPTARR__AUTH__SEERRAPIKEY`. Updated help distinguishes the keys,
   explains the double underscores, and renders the variable as code. Thirteen
   outdated translations are preserved in the repair backlog and use fallback
   until translated; no new native-speaker approval is claimed.
2. `ReadarrScanner.processReadarrBook` forced unmonitored books to unavailable
   even when format-specific files existed. Monitoring now affects acquisition,
   not existing files. Both ebook and audiobook regressions fail against the
   original condition and pass after repair.
3. Audiobookshelf skipped every ISBN-less item. It can now match a normalized
   ASIN to exactly one known scanned book edition. ASIN is a secondary identity,
   not a new guessed catalogue record. Unknown or ambiguous matches remain
   unmatched and the scan reports their count. Missing/invalid ABS items no
   longer preserve stale availability. Existing ISBN matching remains intact.
4. Lumen assigned server IDs 0/1 to ebook/audio formats, rewrote opaque IDs,
   inferred formats from those IDs, hid native Chaptarr search results without
   the companion, and filtered only the popular feed for In Library. It now
   preserves server-authored identities, queries native format feeds/search,
   retains missing-cover titles, and reads scanned book-service inventory from
   `GET /book/library`. This API checks category availability, keeps formats
   separate, paginates after availability filtering, and returns a sanitized
   outage when required providers fail. It uses the existing authenticated book
   router, identity matcher, entity projection and scan evidence. Completed
   request history is not proof of current files. The optional companion remains
   available for extras; ambiguous numeric provider IDs are not reinterpreted as
   Hardcover IDs.
5. Lumen only offered Plex/local login. It now follows SeerrNG public login
   settings for Jellyfin password/Quick Connect and Emby password authentication.
   Disabled methods remain disabled, one sign-in runs at a time, and cancelled
   Quick Connect cannot authenticate after a late poll. All credentials remain
   on the existing same-origin API boundary. Authenticated `/login` redirects
   to Discover. Labels and safe playback URLs follow the configured server;
   Jellyfin/Emby ignore stale Plex app-link metadata.
6. The rating bar inherits a theme transition duration via `app-card-main`.
   With the default transition property `all`, measured `top`/`left` animate.
   One recorded frame was at (283.469, 521.625) while the authored position was
   (304, 541.688). The existing popover owner now transitions paint properties
   only; its geometry, theme duration, provider order and hover delay remain.

## Evidence and validation

Task evidence is retained on kspld0 at
`/mnt/disks/scratch/task-deliverables/seerrng-user-bug-reports-20261106/`.
The reporter's video SHA-256 is
`c3d8a2b976d321e095cf74a975927f781e2295337bc118b9185224b215432744`.

- Original scanner: both downloaded/unmonitored regression cases fail.
- Original rating bar: all four frame-sampled cases fail despite passing checks
  of its settled position. `baseline-position-rules.json` records the computed
  transition and matching stylesheet rules.
- Main UI candidate: 10/10 browser cases pass. Help uses three interface themes
  at 390/1440 CSS px; rating position uses SeerrNGJ/SeerrOrig, normal motion,
  repeated hover, 40 sampled frames per opening. Persius does not mount this
  popover. Captures are in `candidate-ui-ready/`; help baselines are in
  `baseline-help-final/`.
- Lumen: 72/72 browser cases across desktop, iPhone, Android and tablet pass,
  including Plex regressions, new login/cancellation policies, native IDs,
  missing artwork, inventory outside the popular feed, and request identity.
  Final history-hardening captures are in `lumen-history-final-browser/`.
  Login baselines are in `lumen-login-baseline/`. Device emulation screenshots
  use their native device pixel ratios; compare at CSS dimensions.
- Production build, lint, server/client types, 33 scanner/library cases,
  13 initial route/identifier/OpenAPI cases, 24 provider Vitest cases, and
  13 Lumen native/proxy cases pass locally. Added pagination/partial-outage
  assertions and final integration checks are also required before merge.

Rendered comparisons preserve shared button geometry, typography, spacing and
surfaces. Longer help and new authentication controls grow naturally without
horizontal overflow. Representative phone login/playback and book library
screens were inspected. Fixture artwork and provider credentials are excluded;
no physical app handoff, real user library or live Jellyfin/Chaptarr/ABS sign-in
is claimed. An initial local candidate run started before server readiness;
its connection refusals were harness failures, and the readiness-gated rerun
passed. One native invocation accidentally included a Vitest file and a source
module; correctly separated native/Vitest runs passed without weakening tests.

## Operator recovery

Rebuild/recreate Lumen after updating SeerrNG. Configure ebook/audio service
entries independently; enable their scans. Scan ChaptarrNG/Bookshelf before
Audiobookshelf so ASIN-only audio can match known editions. Unidentified ABS
items need a valid ISBN or an unambiguous shared ASIN; title similarity does
not establish ownership. The inventory route represents configured book-service
catalogues joined to scan evidence, not every unidentifiable file in ABS or a
tracking-account library.
