# Lumen recent-search privacy repair

The source review of contribution #458 found that Search used the browser-wide
`lumen-recent-searches` key. Unlike request-title caches and preferences, it had
no account owner. A malformed JSON value also threw during the initial render.

`recentSearches.ts` now uses the existing authenticated session's stable user ID
and the existing AuthProvider principal-remount boundary. It discards the legacy
unowned list rather than assigning it to whichever account next signs in. Reads
accept only an array of strings, retain at most six entries, and recover from
invalid JSON or denied storage. Writes and clearing tolerate storage failures.
The existing Search markup and CSS owners are unchanged.

## Evidence

Task evidence is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`.

- `lumen-history-baseline.log`: both desktop regressions fail on the original
  production build: shared history appears and malformed JSON crashes Search.
- `lumen-history-expanded.log`: all 36 built-frontend cases pass across desktop
  1440×900, iPhone 390×664, Android 412×839 and tablet 834×1194 CSS viewports.
  These include same-browser logout/login isolation, real input/Enter persistence,
  reload/readback, account-local clearing, legacy deletion, malformed JSON and
  denied storage, plus existing API-cache, request, Plex sign-in and device-link
  checks. API responses are deterministic fixtures; no live account is modified.
- Baseline failure screenshots/traces and candidate account screenshots are in
  `lumen-history-baseline/`, `lumen-history-candidate/` and
  `lumen-history-expanded/`. The contact sheet
  `lumen-history-account-viewports.jpg` was inspected for unchanged control
  geometry, navigation, spacing and overflow in all four responsive layouts.

Browser device emulation does not establish physical-device behavior. The
principal-scoped key separates accounts using Lumen's interface; browser profile
storage is not an encrypted vault against someone with local developer access.
