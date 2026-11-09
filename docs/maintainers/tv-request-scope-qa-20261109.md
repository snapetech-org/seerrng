# TV request ownership and episode scope qualification — 2026-11-09

This fixes two reproducible request-path defects reported with the Chicago Fire / Grey's Anatomy screenshot. The screenshot alone does not establish the reporting household's destination, quality, or Sonarr monitoring state.

## Causes and behavior

- Season availability reconciliation skipped pending TV requests. Pending requests now complete when their active selected seasons are available at the matching Sonarr destination and quality. A contradictory destination observation wins over global availability. Requester tag-only approval remains intentional.
- Explicit episode selections could inherit broad future-season monitoring from the service default or request override. Both dispatch policy and the Sonarr adapter now restrict explicit selections. Existing monitoring from other requests or Sonarr is preserved.
- Changing an existing request's Episode Queue buffer did not replace its original full-season selections. The editor now uses one starting episode for queued requests; approval and promotion reject an unchanged broad selection. Saving the queue policy alone still preserves existing requests and downloads. The UI explains that queue length is a playback buffer, not a total episode limit.

## Qualification

Combined source includes main `99bb7f642280c6d64445f274c3ab02738549fa19` and these fixes.

- Original-source regression qualification: 7 failures / 175 passes across four targeted files. Candidate: **503 passing tests across ten files**, covering route approval, promotion, destination/quality availability, exact episode dispatch, playback eligibility, and editor behavior.
- Full production build and changed-file ESLint passed. Feature comparison validation passed (132 capabilities, 89 guides, 152 attribution records).
- Built app, Chromium headless: `/requests` → pending request → Edit → Advanced Options → Episode Queue. Matched baseline/candidate at **390×1000 and 1440×1000**, both **seerrOrig and seerrNGJ**. Inspected all eight screenshots: existing theme geometry and disclosure behavior retained; candidate adds guidance and limits selection to one starting episode. Approval controls remain reachable through scrolling. No browser page errors or horizontal overflow in the four candidate flows.
- Each candidate flow verified broad-selection approval returns 409 without changing pending status; editor approval persisted exactly one starting episode and queue length five, then sent a single-episode search to the isolated HTTP Sonarr fixture.
- A separate exact-five request persisted episodes 1–5 of season 2. Real adapter HTTP traffic searched exactly IDs `93525621`–`93525625`, retained `monitorNewItems: none`, and sent **zero SeasonSearch / SeriesSearch commands** despite an expansive requested future-monitor setting.
- Refreshed two stale Setup translation source-line references encountered after integrating main; no translation wording changed there.

## Evidence and limits

Evidence: `/mnt/disks/scratch/task-deliverables/seerrng-tv-request-scope-20261109/` on kspld0. Authoritative logs: `baseline-qualified-regressions.log`, `combined-final-regressions.log`, `combined-production-build-final.log`, `combined-changed-lint.log`, `baseline-browser-complete.log`, `candidate-browser-qualified.log`; screenshots/reports in `baseline/` and `candidate/`; HTTP capture `sonarr-http-calls.json`.

Synthetic users, metadata and localhost Sonarr fixture only. Periodic background jobs were disabled; immediate approval dispatch used the actual production code. SQLite test fixtures used synchronized schema and skipped migrations: this is not a household deployment or migration qualification. Earlier setup attempts with incorrect fixture endpoints, missing production environment, scanner timestamps or theme disclosure assumptions are retained but excluded from acceptance. No existing household downloads were cancelled or unmonitored. Lumen and unrelated pages were not changed or requalified by this TV bugfix.
