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
