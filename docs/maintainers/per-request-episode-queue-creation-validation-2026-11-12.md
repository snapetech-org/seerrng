# Per-request Episode Queue creation validation — 2026-11-12

## Scope and ownership

User managers can select **Account default**, **Off**, or one to five upcoming
episodes for a single interactive TV request. The selection is stored on that
request; the request owner's profile default remains unchanged. The new control
reuses `RequestEpisodeQueueSelector`, `RequestListboxControl`, and the existing
`request-episode-queue-*` styles. No CSS owner or design values changed.

## Rendered inspection

- **Reference:** the user-provided Discord screenshot in this request (2048 ×
  1152 composite). It shows a request modal whose Episode Queue card reports the
  account default as Off and offers no choice for the current request.
- **Candidate route/state:** `/tv/1416` (Grey's Anatomy), request modal open,
  manager fixture logged in, profile default Off, disposable Sonarr fixture.
- **Candidate viewport:** headed Agent Desktop Chrome at 1440 × 1000. The series
  details and request modal rendered. The Episode Queue control is inside the
  modal's collapsed **Details and actions** section; I could not inspect the
  expanded selector or a chosen value. The screenshot was returned by the
  browser tool but was not retained as a file.
- **Baseline comparison:** not rendered at the same route and viewport. The
  user screenshot is a reference, not a matched local baseline.
- **Excluded:** Bob selected as requester; Account default / Off / 1–5 selector
  states; single starting-episode interaction; 390 px responsive view.

After closing the owned browser session, the Agent Desktop connector could not
start a new Chrome session (`Google Chrome is required for Chrome sessions`).
The existing Agent VM windows were signed into unrelated Amazon Developer and
Chocolatey pages, so they were left untouched. The isolated desktop pool cannot
reach the local LAN preview. **Visual acceptance remains unverified** until the
expanded candidate and a matched baseline are inspected.

## Checks

- Server and client TypeScript checks passed using the local `tsc` binaries.
- API-message generation and surface checks passed after regenerating the
  message source files.
- Prettier and `git diff --check` passed.
- Tests were not run.
- The general locale audit reported 13,367 catalog issues across locales.
  The changed English messages and their source fingerprints were regenerated;
  no task-specific stale-source entry remained.
