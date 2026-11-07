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
