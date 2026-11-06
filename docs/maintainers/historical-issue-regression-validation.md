# Historical book identity and scan report verification

Issue #382's exact production matcher is present in current main and v3.72.9.
Six SQLite regressions now pin its behavior: ISBN-free service-scoped matching,
service separation, exact identity before conflicting ISBN, normalized valid ISBN
fallback, rejection of mislabeled Open Library identities, and retained normalized
Open Library matching. The initial fixture omitted required `tmdbId: 0`; correcting
the fixture makes all six cases pass without changing production matching.

Issue #409's numeric Chaptarr provider identity fix is also delivered. Four HTTP
adapter regressions exercise both hc/gr provider dialects with ebook/audiobook
facades, including capability negotiation and exact outgoing lookup parameters.
The current Chaptarr source translates `work:` to the facade's hc/gr prefix and
accepts canonical prefixes directly; native API lookup must use that prefix.
These cases do not mutate a real service or certify an old container version.

The existing real SQLite Audiobookshelf scanner regression for #376 passes and
verifies consecutive items without overlapping transactions. Source confirms
bundle size one. Existing blocklist navigation tests for #401 pass; both Sidebar
and MobileMenu consume the permission-aware count hook, with mutation invalidation
in the app owner. Active routes and failed counts preserve a recovery path.

Evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`,
including `historical-book-scan-navigation-issue-verification.json`, source blob
identities and focused logs. These records verify four specific reports; they do
not establish completion of the full historical issue or security audit.

release-note: none

## Authentication, per-user preferences and native listboxes

Issue #362: native OIDC flow, claim-role mapping, email/group allowlists and
provisioning are present.36 full OpenID Connect flow cases pass;24 identity,
provisioning and category policy cases pass. Fixed configured callback origins,
signed actor-bound state/nonce, provider-authority rechecks and bounded safe HTTP
fetching retain the relevant security boundaries. No live identity provider is used.

Issues #363/#365: four new API regressions pass for own-user preferences,
cross-account denial, inherited-default reset and malformed input rejection.
The shared service-availability owner additionally hides unconfigured optional
catalogs and respects global/admin defaults and personal choices. Headless checks
save from the actual own-profile page, verify persistence after reload, and confirm
movie/software navigation is hidden while series navigation stays available.
The initial harness used the manager-only `/users/:id/settings/main` route for an
ordinary user; the real own-user entry point is `/profile/settings/main`.

Issue #400: a four-option native Prowlarr indexer listbox retains its declared row
height and independent multi-selection at390/1440 widths in all three themes.
Compact settings select geometry explicitly excludes `multiple` elements.12
headless cases across these routes/themes pass. Provider coverage is a deterministic
fixture; personal preference writes use the isolated QA database and restore prior
choices. Captures/logs use the `historical-issue-accepted-*` evidence prefix.

## Plex PIN transport limits

Historical auth-network review found that PIN creation and polling used the fixed
`clients.plex.tv` origin and a ten-second timeout, but inherited Axios redirects
and an unlimited response size. Both requests now reject redirects and cap
responses at 64 KiB and request bodies at 1 KiB. The PIN protocol requires no
redirect. Two route tests failed against the prior source because the limits
were absent; both pass with the fix. Existing pending-404 and non-404 error
handling tests also pass. This is transport hardening, not evidence of a
compromised Plex endpoint. No live Plex account was used.
