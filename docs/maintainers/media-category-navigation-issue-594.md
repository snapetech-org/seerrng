# Media category navigation: issue #594

The report's screenshot shows Book Recommendations and Collector Picks remaining
visible after disabling Books, Audiobooks and Music. Both routes fell through
`isOptionalCatalogPathEnabled` and returned true. The primary category routes
already used the correct checks.

The shared route owner now applies Music's existing category/service check to
Collector Picks and either book format's existing category/service check to Book
Recommendations. Desktop sidebar, mobile drawer, bottom-menu overflow and direct
route visibility consume this owner. Existing permission checks remain attached
to each link. No component, CSS, theme, geometry or provider integration changed.

## Verification

- Added a native regression; it failed against source `1e23ef329` with true where
  false was required. After the fix all 14 service-availability tests pass,
  including administrator global-disable behavior, missing services and retaining
  recommendations when either supported book format remains enabled.
- Production build (including TypeScript), scoped ESLint and diff checks pass.
- Production baseline and candidate renders use SeerrOrig and SeerrNGJ at
  390×900 and 1440×900. Each covers enabled categories/services, globally disabled
  categories with services configured, and absent services. Four test groups per
  source pass: 12 matched states with no unexpected page exceptions or document
  horizontal overflow. Both related links remain in enabled states and disappear
  together with primary links in unavailable states.
- All 12 before/after pairs were visually inspected. Mobile viewport captures
  scroll the overflow menu to Share & Identify so the affected links and adjacent
  library entries are visible. Typography, controls, theme surfaces and retained
  links preserve their existing owners. Only the intended links disappear.
- Task evidence: `/mnt/disks/scratch/task-deliverables/seerrng-incoming-review-20261106/issue594-ui/`;
  `issue594-baseline-regression-native.log`, `issue594-focused.log`,
  `issue594-production-build.log` and `issue594-lint.log` share its parent.

Settings/public responses are read-only fixtures; no household service settings
or provider actions were changed. This follow-up is newer than the immutable
v3.72.19 source and must not be represented as included in that release.
