# Episode availability contribution recovery

Preserve and integrate the original histories of PRs #454 and #493. These contributions add opt-in, source-scoped episode inventories for Sonarr, Plex, Jellyfin and Emby, with independent standard/4K state and explicit metadata-order matching. They are repaired before merging rather than closed without delivery.

## Root causes repaired

- Sonarr service ID zero was rejected as though it were an invalid database ID. It now persists and clears its own source records correctly.
- Malformed inventory identifiers could become an empty inventory during filtering and erase a complete snapshot. Reconciliation now rejects invalid or duplicate identifiers; only confirmed complete empty inventories clear a source.
- Sanitized provider responses could conceal omitted, invalid or partial episode/season lists. Tracking uses complete reads with raw counts, bounds and identity checks. Unknown Sonarr resolution preserves the prior quality snapshot. Ordinary scans retain their established path when tracking is off.
- Global media-server file records bypassed linked-viewer episode visibility. Responses now intersect them with identity-verified, viewer-visible episodes and file qualities. Provider failures hide those indicators. Acquisition-only Sonarr indicators remain distinct from playback access.
- The new settings component imported the server settings runtime into the browser, failing production compilation on filesystem/network dependencies. One browser-safe metadata-provider enum is shared by client and server.
- The original badge code targeted an unused legacy Season component. Source details now reach the live season/episode tree through the existing availability tooltip; the unused component is removed.
- Narrow layouts squeezed episode names and made status controls unreachable. The shared media-server panel stacks on phones, dates move below names in the shared tree, and a stable semantic selection wrapper preserves grid placement when a native disabled button needs a keyboard-accessible tooltip. Native disabled state and request/playback selection behavior remain unchanged.

## Validation and evidence

Evidence is retained at `/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`.

- Actual baseline failures: zero service identity and destructive malformed inventory reconciliation (`episode-source-baseline-regressions.log`); production browser/server dependency import (`episode-production-build.log`); inaccessible phone status and unreadable name captures.
- Final focused native tests: 68 passed across provider APIs, snapshot persistence, linked-viewer projection and Jellyfin scanner consumers. The broader initial scanner/route run passed 150 cases; its seven tracking-path failures were repaired and the affected scanner checks pass.
- Shared tree and data projection checks: 20 passed. Request-modal component checks: six passed, preserving disabled and selectable episodes without external mutations.
- Production server/client build and later UI builds pass. i18n extraction/check, scoped ESLint and formatting pass.
- Sixteen browser cases pass across SeerrOrig and SeerrNGJ at 390×900, 639×900, 641×900 and 1440×900. They verify numbering-order saves preserve enabled libraries, visible episode names, source/quality tooltip interaction, no document overflow and no inferred playback availability. Matching baseline captures retain the prior absence of numbering controls and broken phone layout.
- Desktop and phone source captures were visually reviewed in `episode-final-theme-review.jpg`; numbering settings use the shared form owners. The table retains desktop geometry, and mobile names, dates and status controls use the shared responsive owner. No new page CSS or copied style values.

External providers are fixtures. Existing unavailable saved-state feedback remains visible in the screenshots; this does not certify live media-server access or playback on physical devices. Final owner CI must pass before integration.

## Combined theme and policy integration

The final integration also preserves PRs #424/#416/#457, #447/#446/#491 and #461/#449/#489/#429 through integration heads #557/#556/#559. All 15 original/integration heads are verified ancestors of the combined head and every original targets main.

Combining the source required two additional repairs: tag-excluded Sonarr series clear their episode records, and episode-source selection uses the scanner's enabled/quality gates before endpoint deduplication. Rule-selected language profiles retain their provenance instead of becoming explicit user overrides. New regressions cover each behavior, including service/profile zero and deliberate reselection.

Combined production build passes on Node 24.22.2. The integration checks pass 279 native tests, 36 component tests, and 36 headless browser cases, including the installed Recovery Cinema derivative. A source scan of all 2,587 tracked TypeScript files finds no duplicate object keys after fixing the SQLite fixture. Of 53 matching prior theme captures, 44 are pixel-identical; changed captures were visually inspected. Remaining differences include fixture settings/selection values, added settings rows, and isolated raster/spinner frames. Shared geometry and native presentation are preserved; phone tree changes are documented above. Evidence: `all-recoveries-*` logs, screenshots, comparison JSON and changed-theme review montage. Provider access remains simulated. Full owner CI must pass before integration.

The full `pnpm build` path, including i18n and current-batch prebuild gates, also passes. CI exposed a stale structural check that still required the selection marker on the native button after its stable wrapper was introduced. The checker now requires that wrapper, its native episode-control button, and the exact disabled eligibility condition. All 46 contract tests pass, including negative mutations removing each requirement. Evidence: `all-recoveries-prebuild-contract-tests.log` and `all-recoveries-full-prebuild-and-build.log`.
