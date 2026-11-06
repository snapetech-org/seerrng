# Bindery requester identity boundary

Issue #351 verification found that matching mutable display names to Bindery
accounts could assign a request to somebody else. An isolated native baseline
sets the ordinary requester's display name to `Victim`, receives remote account
`victim`, and observes an unwanted `forUser: 7` submission. The real user-settings
API separately confirms that ordinary users can edit their own display names.

The per-service `binderyUserMappings` setting now contains explicit
administrator-owned SeerrNG-user-ID to Bindery-user-ID links. Settings mutations
retain ADMIN authorization and validate bounded positive integer IDs. Dispatch
checks the stable requester ID, verifies that exactly one remote account has the
configured ID, and fails closed when a mapping or account is missing. It never
infers ownership from names/email. A backend without the advertised requester
capability retains its existing service-account acquisition behavior.

Validation:

- Four focused native Bindery dispatch cases pass, including a mapping that wins
  over a conflicting mutable name, unconfigured name rejection, and existing
  format/capability behavior. The new negative case fails on the baseline.
- The pure mapping validator accepts bounded numeric links and rejects arrays,
  null, strings, prototype keys, noncanonical/negative/oversized IDs, noninteger
  targets, and more than 1000 mappings. Component submission retains the map.
- Production build, i18n checks and shared UI/style contracts pass. The first
  build rejected a nested description; the field now uses the existing full-row
  description owner. No CSS dimensions or overrides were added.
- Six real browser/API cases pass at 390x900 and 1440x900 in all three themes.
  Invalid mapping text disables saving; valid maps save through the production
  OpenAPI route and read back unchanged. An ordinary user can rename their own
  display name but gets 403 attempting to change an administrator's mapping.
  The fixture service is deleted after each case.
- Six matching baseline viewport captures and six candidate viewport captures
  cover the connection-tested dialog and the new mapping field. Phone and
  desktop captures were visually inspected for labels, field geometry, wrapping,
  surfaces, controls and overflow. Long dialogs use the existing scroll owner.

Evidence lives in the contribution-recovery task deliverables:
`bindery-display-name-baseline-owned-worktree.log`,
`bindery-explicit-mapping-native.log`, `bindery-mapping-validation.log`,
`bindery-mapping-component.log`, `bindery-mapping-accepted-viewport.log`,
`bindery-mapping-{baseline,accepted}-viewport/`, and comparison contact sheets.
The first baseline command accidentally ran in the original checkout and did
not match the new test; only the owned-worktree log proves reproduction. The
first candidate browser attempt passed five cases and hit an undefined test
fixture variable in the permission case; the corrected six-case rerun passes.
Full-page screenshots changed the apparent modal framing, so visual acceptance
uses matching actual viewport captures instead. No live Bindery accounts,
acquisition submissions, or physical mobile devices were used.

The combined recovery CI/main merge and next release remain required. This
checkpoint does not claim those delivery gates or the entire issue audit are
complete.
