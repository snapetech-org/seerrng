# Lumen contribution recovery validation

The recovery preserves contributor PR #458 through commit `835c271e3`, including
`676768f` (explicit trusted proxy handling) and `835c271` (mobile Plex links).
Security hardening adds account boundaries to caches and preferences, validates
playback URL schemes, and applies sanitized protocol forwarding to the companion
route. Empty or failed trending feeds finish loading with an explanatory state.

Lumen keeps its contributed CSS owners under `lumen/src/styles/`; this recovery
does not redesign those owners. The separate Vite build must not inherit the main
app's PostCSS pipeline. Its Docker context excludes local dependencies and builds.

Reproduce validation using the commands in `lumen/README.md`. The independent
Lumen workflow runs without secrets or persisted checkout credentials, with read
access on public ephemeral runners. It validates pull requests and main changes.

Local validation on 2026-11-05:

- TypeScript/Vite production build and the complete Docker image build pass.
- Nine security tests pass, including real nginx checks against all four proxy
  routes, malformed trust configuration, device-specific Plex links and unsafe URLs.
- Twelve Chromium browser checks pass across desktop (1440×900), iPhone 13
  (390×664), Pixel 7 (393×727), and iPad Pro 11 (834×1194) emulation.
- Routes `/`, `/movie/101`, `/me`, `/requests` use deterministic API fixtures with
  locally supplied artwork. The populated route screenshots are compared with the
  unmodified contributor head at the same viewports and states. Loading, empty and
  failed trending states and account switching receive explicit assertions.
- The account isolation regression fails on the original contribution and passes
  with the recovery: preferences are account-local and previous-account cached
  playback availability does not appear while the next account's response waits.

Evidence is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`,
including browser screenshots/traces, image comparison results, build logs and
nginx test logs. These are synthetic catalogue/API-boundary tests; they do not
prove live Plex authentication, physical app handoff, or every optional provider
integration. Book, games and other optional pages require their own provider QA.
Headed desktop-pool capacity was unavailable; headless QA was explicitly authorized.

## Android routing follow-up

Contributor commit `8e95d4835` arrived after the initial integration. Android uses
its playback route for movies and library route for series; it does not use the
iOS preplay route. The recovered helper retains URL validation, bounds server and
metadata identifiers, rejects decoded routing delimiters, and keeps the web
fallback. Ten security checks and sixteen Chromium browser checks cover the
follow-up, including actual movie and series link props at all four viewports.
Physical Plex application handoff remains outside the emulated-browser evidence.
