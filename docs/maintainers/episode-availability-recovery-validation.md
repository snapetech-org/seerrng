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
