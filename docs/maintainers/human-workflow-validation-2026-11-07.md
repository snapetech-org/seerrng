# Human workflow verification — November 7

This is an ongoing issue-by-issue audit. Source links, closed issue counts and
rendered routes alone are not completion evidence. The historical 73-row inventory
remains in [the November 6 ledger](closed-issue-resolution-audit-2026-11-06.md).

The isolated production candidate includes commit `aafa2ac51`. Baseline is the
published v3.72.21 container digest
`sha256:a0f41016e1e0762d3f606f05fcf9ef35fa856d38c962860a06b57c63178c6eee`.
No household acquisition, account mutation or email delivery is used by these tests.
Artifacts are retained on kspld0 under
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/`.

| Issues | Human path and result | Verification and limits |
| --- | --- | --- |
| #498 | Settings → Plex → Analyze On Playback → Save; repeat without reloading | Released baseline fails both desktop themes on the second save. Candidate passes four phone/desktop cases using actual settings persistence and a loopback Plex fixture. Eight maintained cases also cover failed-save recovery and untouched Tautulli. Real household playback is not claimed. |
| #500 | Movie collection → Queue Collection → Movies Ahead | Released Orig hides the action under Details. Candidate exposes it beside Request Collection. Eight maintained English/Arabic cases pass in Orig/John at 390/1440 widths. Native queue/playback contracts are checked separately from dialog discoverability. |
| #503 | Requests → TV request → Episode Queue → Queue Length → Save Changes | Existing v3.72.21 works: four actual API persistence/reload/default-reset cases plus four denial/recovery cases. The initial legacy-owner diagnosis was incorrect; the public issue records the correction. |
| #159, #174, #179 | Profile → Settings → General → External request lists | Four Orig/John phone/desktop cases add through the real API, reload, remove and reload. Failed sync and CSV payload/summary use deterministic API responses; no live IMDb/Goodreads availability is claimed. Native tests cover owner-scoped imports/dispatch and provider challenge handling. |
| #504 | Settings → Services → Open guided setup | Four Orig/John phone/desktop cases save defaults to the real database, revisit them, choose both download types, enter Movies & TV, skip optional configuration and return to Services. No real downloader is configured. |
| #195 | Settings Search → API → General API Key | Existing ordinary search passes; one intermittent early attempt led to a delayed-permissions regression. Both themes previously accepted input before permissions; the candidate disables it until readiness, then navigates and focuses the API field. |
| #363, #365 | Own Profile → Settings → General → Media Categories | Maintained checks save real own-user category choices, reload and verify navigation. Separate API contracts cover cross-user denial and inherited defaults. Admin defaults and service availability still bound personal choices. |
| #400 | Settings → Prowlarr → Indexer assignments | Maintained checks open the panel, select multiple of four options and measure native listbox height at phone/desktop widths. Coverage discovery uses deterministic provider data. |
| #351, #425 | Settings → Services → Books → Add Bindery | Maintained UI cases exercise requester mapping and save payloads in all three themes. Native dispatch remains the evidence for backend request ownership; no live Bindery instance is claimed. |
| #597 (new) | Requests and comic availability notification | 68 focused native cases pass for destination/file truth, legacy repair, title/cover and duplicate-notification prevention. Eight real-status API/browser cases pass in both themes at phone/desktop widths: accepted and legacy-completed records without files show Processing, then Available after confirmed inventory. ComicVine metadata is a read-only fixture; scanner transitions are covered natively. Stable release remains pending. Run configured comic scans after upgrading to repair legacy rows. |

The first external-list test run passed; guide harness failures used incorrect
labels and an invalid whole-response cleanup payload. Correcting those fixtures
produced four passing guide workflows without production guide changes. Original
failed logs remain alongside corrected logs. A mixed native/Vitest command also
used the wrong runner for three Vitest files; the corrected runs pass 74 native
and 45 Vitest cases. These are test-harness corrections, not application fixes.

Remaining historical issue paths, new contributions and release qualification are
still being checked. This document does not certify every provider integration.


## OIDC and theme-grid follow-up

For #362, four real browser workflows now link an account from Profile → Settings
→ Linked Accounts, reload the saved link, sign out, and sign in through the
provider button back to Requests. They use a dedicated loopback OIDC fixture
with real discovery, PKCE verification, RSA-signed ID tokens and the actual app
session/API. Both themes pass at 390/1440 widths. The fixture uses explicit
insecure/private-address allowances only in the isolated QA process; no live
identity-provider account is used. Provider setup remains documented in
`docs/using-seerr/settings/users/oidc.md`, including the protected settings file;
these checks do not claim a provider-secret editor in the admin UI. Initial
harness failures matched a destination inside the login query and then used
`redirect` instead of the supported `returnTo` parameter; no app change was needed.

The first two hosted browser runs each passed 345 cases, skipped one, and failed
the same legacy phone-grid assertion. That test loaded Orig while requiring
John's two columns at every phone width. Pinned upstream source
`564bfb08b54caa374bddaf820abfd226e5e69151:src/styles/globals.css` declares a
9.375rem (150px) minimum track; Orig correctly has one expanding column at
320px and two at 360–412px. John retains two columns throughout. The revised
regression explicitly selects each theme, keeps stylesheet-rejection/recovery
and MIME checks, asserts each source's exact column count/poster minimum, and
restores the account presentation. All 12 layout cases pass locally, including
nine routes at eight widths and cast non-overlap. Phone captures were inspected.
No production grid CSS was changed to satisfy an obsolete cross-theme assertion.

The release candidate is still unpublished while final exact-head CI is pending.
New #598 (publisher bootstrap) and #599 (settings disclosure) remain open.


For #501, the focused native dispatch suite passes 24 cases across Plex,
Jellyfin and Emby, requester/authorized household viewer, inherited/default-off
per-request override, and matching/unrelated series. Another authorized viewer
can advance a matching series at the existing watched threshold; an unrelated
series does not. This is deterministic session/dispatch evidence, not playback
on a real household server. The queue controls themselves use the already
verified #503 Requests UI and the user's TV queue defaults.

## Broader settings recovery — #600

The continued audit reproduced a separate failure beyond the Plex/Tautulli
repair frozen for v3.72.22: General's failed POST left its draft visible but
cleared the unsaved state and disabled Save. The shared layout's legacy submit
path treated submission as persistence. Remaining editable Formik owners now
report dirty/submitting state, reset only after a successful mutation and
refresh settings only on success. This covers General, Users, Media Categories,
Network, Jellyfin/Emby, both Metadata forms and all eleven notification agents.
Discovery/service editors with their own actions are outside this change.

The actual API sweep also found two distinct contracts: Formik normalizes empty
strings to undefined for Yup validation, so unconditional `.defined()` rejected
optional Apprise configuration keys and ntfy topics while the agents were off.
Required validation remains enabled-agent-only. Web Push's form/model have no
notification type mask; its route now marks that field optional while rejecting
malformed masks if supplied. Other notification agents keep their requirements.

- `playwright/settings-save-recovery.spec.ts`: 64 passes across Orig/John and
  390/1440 widths. Real isolated settings API writes, reload and restore; only
  the first 503 is simulated. Covers sixteen route/form cases, including every
  notification agent, and proves retry and a second save without reload.
- `playwright/settings-secondary-save-recovery.spec.ts`: eight passes for the
  Jellyfin form and TV metadata selector with API fixtures. These establish form
  recovery/readback behavior, not a live Jellyfin or metadata-provider connection.
- Native settings route checks: ten passes, including omitted Web Push types
  and rejection of malformed supplied types. Production compile/typecheck,
  lint, i18n/source-catalog and shared UI contracts pass; existing lint and
  translation-review warnings remain classified by their own checks.
- Baseline: frozen v3.72.22 candidate d595815, local port 55162. Candidate:
  settings worktree, separate config/database, port 55164. Thirty-two baseline
  visual captures cover General, Users, Network, Metadata and Email/ntfy/Web
  Push/Apprise in matching themes/viewports. The baseline gallery is a visual
  record, not 32 successful recovery assertions. Two preliminary gallery runs
  stopped at a disabled Save after programmatic select changes; the final
  gallery captures that state without forcing submission.
- Inspected matching General Orig phone, Network Orig desktop, Email John
  desktop and Apprise John phone captures. Existing geometry, surfaces,
  typography, error visibility and action placement remain stable. Paired
  comparison images concatenate top/bottom crops; their seam is not page layout.
  Full captures and the route/state manifest remain in the task deliverables.

The source contract now parses Users' JSX ownership instead of requiring an
exact one-line `<Form>` opening tag, so save-state attributes do not falsely
break the shared-card check. A mutation regression rejects removal of that role.
Initial test harness failures used input operations on selection buttons/native
selects; corrected tests use their real controls. The independently reproduced
Web Push and optional-field failures required production repairs above.

This milestone is not included in the frozen v3.72.22 tag candidate and does not
complete #599's requested settings disclosure or the remaining historical audit.


## November 8 delivery and continued issue checks

The earlier scoped milestones have since shipped: #498 playback-analysis settings
in v3.72.22, and #599 compact settings plus #600 settings recovery in v3.72.23.
The downloaded v3.72.23 image passed 162 settings workflows, including six compact-mode
cases at 320/390/1440 in Orig/John. This supersedes the pending-delivery statements
in the historical sections above; it does not complete all 73 issue workflows.

- #366: eight actual downloaded v3.72.23 workflows pass in Orig/John at 390/1440.
  Admins test the local Prowlarr connection, assign an indexer/category, set search
  limits, save/reload, search, send to the synthetic downloader, reject a replay,
  and see quota feedback. Four assigned indexer IDs and exactly four handoffs are
  independently recorded by the HTTP fixture. Four separate admin/non-admin
  workflows enable global details, change the target user's Show indexer details
  control, save/reload and confirm the next real search hides names and links.
  All fixture settings/permissions are restored; 27 focused native checks pass.
  Indexer Search retains the documented Manage Requests/admin boundary. No real
  indexer, torrent/NZB download or household downloader is used.
- #500: actual downloaded v3.72.23 browser/API/SQLite/worker evidence completes the
  full two-ahead → watched → exactly one additional request → fresh readback →
  human Stop → no additional admission flow. Synthetic Plex playback and UI
  metadata replay are explicit; ordinary approval policy remains enforced.
  Additional SSR Retry and polling repairs are on main, awaiting replacement
  release delivery. The earlier corrected milestone CI 42450549566 passed.
- #602: visible language settings, verified-language request admission and
  collection recovery are on main 35ef01975. Metadata settings save/reload,
  failure/Retry and clear-to-unrestricted paths pass both themes and widths.
- #605/#606: see the linked book lookup and ownership recovery runbooks. Real
  slow-provider modal recovery passes four layouts, edition author encoding is
  repaired, and scan ownership is restored without moving media or requests.
  These fixes remain outside published v3.72.23 until replacement publication.
- PR #607: both contributor commits are merged, with reviewed repairs and 423
  Lumen browser passes/13 documented viewport skips plus27 native/proxy checks.
  All24 new regressions fail against the contributor baseline and pass after
  repair; eight additional selected-state visual checks pass. Published23 does
  not contain this feature. Main ancestry and zero open PRs were read back.

Evidence remains in task deliverables under issue366-*, issue605-*, issue606-*,
collection-progression-* and pr607-*. The combined-head 6750bcdd7 Lumen validation
42454294953 passed. Full CI 42454350430 is in progress; release qualification and
remaining human issue paths are still open. No blanket completion is claimed.


## Further shipped-image checks — November 8

- #294 and #346: actual downloaded v3.72.23 passes four Orig/John 390/1440
  album-and-discography workflows using a destination named Lidarr with profile
  Lossless Preferred and no explicit music-quality override. FLAC enables, MP3
  remains unavailable, confirmation creates pending requests, and reload/API
  readback retains the chosen destination/profile/root. Four additional cases
  verify Requests and persistent history without inventing download progress.
  The same core workflows pass against source24; four native quality and three
  consumer/component checks pass. Artist/collection metadata is a one-album
  replay; album metadata and request persistence use the actual backend. A
  read-only loopback Lidarr fixture receives no acquisition writes. All test
  requests and temporary services are removed. Public receipts:
  [294](https://github.com/snapetech-org/seerrng/issues/294#issuecomment-6718538011),
  [346](https://github.com/snapetech-org/seerrng/issues/346#issuecomment-6718538198).
- #511 was reopened after the actual v3.72.23 Test connection succeeds but
  Add library remains disabled after automatic selection of its sole book
  library. All four theme/viewport cases reproduce the blocker. Two real-Formik
  regressions also fail for automatic and manual selection: a second field
  update validates the old empty library ID. Removing redundant library-name
  updates leaves selection as the single validation update; submission already
  derives the name from the loaded library record. The original typed-port
  regression and both new cases pass. Production candidate and full release
  qualification remain separate gates. Four real API/browser candidate workflows
  pass, including save/reload and edited-port failure/retry. Matching captures
  were inspected; [the evidence record](audiobookshelf-library-selection-recovery-2026-11-08.md)
  records the baseline, repair and publication limits.

Evidence: `music-published23*`, `music-status-published23-qualified*`,
`music-human-qualified5*`, `music-quality-*` and `abs511-*` in the retained task
artifacts. The first music harness runs used ambiguous playback/request controls,
assumed a heading instead of the existing named dialog, allowed service workers
to bypass metadata replays, and expected bulk HTTP 200 instead of the documented
207 response. Those harness mistakes were corrected; they were not production
fixes. The ABS harness initially required labels without their visible required
asterisk; correcting that selector exposed the independent, genuine save bug.

This expands the evidence; it does not complete the remaining historical human
workflows or certify every external provider deployment.

Request Status follow-up for #104/#243 adds six worker-backed lifecycle states in
both themes/viewports, actual owner Retry, measured/unknown progress, persistent
history, cross-user denial, and four initial-error recovery cases. The underlying
PostgreSQL count regression now executes successfully rather than skipping. Its
runner isolation/CI correction and evidence limits are recorded in
[the detailed status validation](request-status-human-and-postgres-validation-2026-11-08.md).

The fresh PostgreSQL app now also passes 157 migrations and eight authenticated
phone/desktop and Orig/John checks for empty-owner counts and status Retry,
covering #164/#181/#243 with the limits in the detailed status record. Visual
inspection exposed #608's shared pagination overlap; its existing owner is
repaired and all 60 consumer/theme/viewport cases pass, alongside two Arabic cases
and exact desktop geometry comparisons. See
[the pagination evidence](responsive-pagination-validation-2026-11-08.md).
#511 and #608 remain open until a replacement artifact delivers their fixes.
