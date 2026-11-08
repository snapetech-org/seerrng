# Magazine and sports tracking: availability, delivery and human workflows

Issues #612 and #613 were discovered during the requested historical issue and
contribution audit. Main `64a5fa501` fails two native notification probes:
a PROCESSING magazine with a completed tracking request hydrates `Magazine Now
Available` without files; a pending sports league throws `Unsupported media
notification request`. Two further status probes return Library for accepted
magazine/sports tracking with no file evidence. These are separate from #611's
book dispatch repair and are not a claim about malicious contributor intent.

## Behavior and ownership

Magazine and Sportarr requests add titles/leagues for tracking. That acceptance
retains its existing completed tracking history, but does not establish downloaded
files. Requests now show Searching while waiting for files, with the correct
LazyLibrarian/Sportarr service instead of a Readarr fallback. The existing shared
Requests status/timeline/tooltip owners render the change; no CSS, theme,
permission or database schema change is introduced.

Magazine availability is verified for the requested destination, including service
ID zero. The scanner records file presence in the existing per-request
`serviceTargets.status` field. Another library's scan cannot erase that observation
or repeatedly notify the same destination. Observed removal clears only that
service's file evidence; a later reappearance is a new legitimate transition.
Unknown legacy destinations and tag-only targets are not guessed. Existing
completed tracking requests receive one availability intent when a file is newly
observed. Other request transitions retain their existing subscriber completion
path. Observation, target status and the intent share the scanner transaction;
rollback rolls them back together. Existing bounded keyset batches are reused.

The scanner requests strict LazyLibrarian issue inventories. Malformed, unrelated,
oversized/truncated and invalid file-field responses cannot become proof of
absence. Existing non-scanner detail/calendar callers keep their compatible soft
fallback. Empty/wanted issue lists and nullable/absent file fields remain supported.

Sports pending, approval, decline, failure and automatic request notices now use
cached human league metadata and a canonical validated `/sportarr/<leagueId>`
link. Opaque titles remain provider text. Missing titles have a recipient-localized
fallback; body/subject descriptors survive durable storage. Arbitrary slugs do not
become links. League completion alone never emits event-file availability; current
event/file status remains on the league details page.

## Validation

- 69 core native checks pass, zero skipped: LazyLibrarian contracts, destination
  predicates, MediaSubscriber, request status and notification intent hydration.
  The initial four baseline failures are retained. Cases include independent
  destinations, zero IDs, file removal/reappearance, alternating/repeated scans,
  rollback, unavailable inventories, supported notification kinds, canonical
  identity and safe fallback. A new legacy fixture originally omitted its
  required external ID; correcting that fixture did not relax the authority guard.
- A final 15-case LazyLibrarian client recheck also passes, including a numeric
  file-marker regression: a number cannot become a downloaded file path in
  detail responses.
- 31 notification storage/recipient-localization checks pass, zero skipped.
  These retain descriptor allowlists and prove delivery-time text resolution;
  fixture Arabic messages are not a claim of reviewed shipped translations in
  every locale. English catalogs and source fingerprints are refreshed.
- The production prebuild/i18n, server and Next.js builds pass after the final
  strict-inventory changes. Focused ESLint passes. Whole-source formatting and
  release contracts are recorded separately for the final committed head.
- Four actual production browser/API/SQLite workflows pass in Orig/John at
  390/1440×900. They inspect the current status control and its explanation, use
  actual compiled LazyLibrarian scans against two read-only loopback providers,
  and verify an observed magazine file becomes Available while the sports league
  remains Searching. The requested service has a file while the last scanned
  other service has none; availability remains owned by the requested destination.
  Ancillary title/cover metadata is replayed in-browser; status is the real API.
- Matching baseline captures reproduce Library before the patch in all four
  layouts. Candidate captures show Searching/Available using the same Requests
  owners, preserved geometry, readable tooltips and no document overflow. Full-page
  captures taken after scrolling can place the fixed header within the composed
  document image; that capture seam is not a newly introduced CSS rule.
- Actual compiled scanner → durable notification → real loopback webhook checks
  pass with two providers: zero premature availability deliveries, one sports
  pending delivery with the human title and validated URL, one magazine delivery
  after its requested service reports an issue file, and no repeat delivery on
  another full scan. A malformed primary inventory then preserves its verified
  observation; restoring the valid inventory sends no duplicate notice.
  No real acquisition, provider mutation or external
  notification is performed. The private-notification allowance is limited to
  the isolated CLI delivery process; production network policy is unchanged.

Initial harness errors are retained: a repository helper ran with a different
worktree cwd and mixed TypeORM class identities; a UI assertion expected a tooltip
before focusing/hovering; baseline service-name assertions overlooked a cached
historical event; and an in-memory webhook template change did not replace the
runtime snapshot. Corrected fixtures use the matching compiled cwd, current status
control, scoped baseline allowance and the agent's explicit test configuration.
None of those harness failures are counted as product regressions or repairs.

Evidence resides on kspld0 in
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/`
under `sibling-notification-*`, `magazine-*` and `tracking-notification-*`.
Synthetic configurations/providers are in the corresponding task cache under
`tracking-notification-*`. Issues #612/#613 remain open until actual release
artifacts contain the fix and the delivery checks pass. This milestone does not
complete the entire historical human-workflow audit.
