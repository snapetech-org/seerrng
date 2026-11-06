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

## Book list identity and additional historical checks

Issue #53 now has a real SQLite-backed list-route regression: a book request's
canonical OpenLibrary identifier must be present in the returned media, which
request cards use to resolve their details. The current separate media-relation
hydration passes; this case does not call a live book provider or render its card.

Issue #52's mounted pull-to-refresh test confirms that starting at the top does
not lock page styles and upward motion remains uncancelled; modal style leases
and pending reload cleanup are retained. This is React/JSDOM evidence, not a
physical iPhone/Safari test. Issue #192's eight filter tests verify the default
fifty-vote threshold for rating sorts and preservation of an explicit zero-vote
choice; no live TMDB ranking comparison is claimed.

## Category layout and typed Jellyfin port follow-up

Reports #236 and #237 were checked against their original attached screenshots.
Six headless cases cover Media Categories in all three themes at 390×900 and
1440×900. Desktop selection buttons align with label centers within 3px;
phone controls follow the existing stacked form layout. Descriptions remain
beneath their own labels, inside their rows, and aligned to the label edge.
Clicking each tested label toggles its associated selection button, and the
Movies state is restored without saving. All six cases pass, and the six
current screenshots were visually inspected against the historical reports.
Initial harness failures counted an unrelated compact row, assumed native
checkbox inputs, or assumed desktop geometry on phones; those artifacts remain.
No production layout changes were needed. Native Firefox/Windows rendering is
not claimed by this Chromium/Linux run.

Report #96 also passes an actual browser submission: type 8097 into Jellyfin's
port field and save; the intercepted request contains numeric integer 8097.
The initial harness expected “Save Changes” instead of the actual “Save” label.
No live Jellyfin connection was made; the previously recorded 17 server/API
cases cover server-side validation separately.
