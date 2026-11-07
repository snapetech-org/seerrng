# v3.72.20 Verification

[v3.72.20](https://github.com/snapetech-org/seerrng/releases/tag/v3.72.20)
published November 7, 2026 at 04:34:44 UTC with 29 assets from immutable source
`110ce87378da7c0fccc615d5997f597faf163775`. The downloaded production image
reports this exact version and commit. Its multi-architecture manifest is
`sha256:d3ac93c938c80a46563f1091ad06b4b75c6f2b7e0b1f6cbcb055ad87f2f46804`.
All 21 stable/version aliases across canonical GHCR, Docker Hub and legacy GHCR
resolve to that manifest. The
[release workflow](https://github.com/snapetech-org/seerrng/actions/runs/42336823753)
succeeded, including platform builds, image scans, signing and attestation checks.
The prior failed v3.72.17 tag remains immutable; it was not repointed.

## Source qualification

[Exact-source full CI](https://github.com/snapetech-org/seerrng/actions/runs/42333250272)
succeeded: 4,731 native cases (4,726 pass, five intentional skips, zero failures),
all four Vitest shards, 324 Playwright passes with one intentional custom-theme
skip, and 203 Cypress passes with 32 conditional pending cases. Lint, typecheck,
production build, tooling/i18n, documentation, Helm and Jellyfin bridge checks
passed. Pending/skipped cases are not counted as verified features.

The subsequent `e78a8b71c` commit records audit evidence. `16065445a` only makes
the rating fixture wait for its catalog response, selected theme, 12 cards and
fonts before hovering. Neither changes the shipped application. Catalog pin
and final documentation refreshes also do not change the release source.

## Downloaded-image browser and visual checks

The real registry image ran read-only with dropped capabilities, no new
privileges and isolated fixture configuration. External provider requests were
blocked; real local auth, settings, database and application components remained
in use. Signed-in route captures cover both SeerrOrig and SeerrNGJ at 390×900
and 1440×900: 94 static and 52 dynamic routes per theme/viewport, 584 total.
All eight route groups pass without unexpected page exceptions or horizontal
overflow. Ten anonymous captures use the shared public theme; account-selected
SeerrOrig before authentication is not claimed.

The matching actual-v3.72.18 comparison has 524 pixel-identical pairs and 60
visually inspected differences. Differences include version/log/job-cache values,
placeholder paint, small focus states and asynchronous loading. An initial
SeerrOrig desktop Discover capture differed in document height by 48px while
its offscreen sliders were not fully rendered. Matched rechecks scroll every
slider into view before capture, wait for hydration, and assert loaded services,
webhook and provider-error states. All four settled Discover layouts have
identical slider geometry; 15 of the 16 settled route pairs are pixel-identical.
The remaining pair differs only in the Services navigation focus ring.
All six compiled CSS files and both served theme packages match v3.72.18 and
v3.72.19 byte for byte; this follow-up introduces no CSS changes.

Twenty populated request/issue/blocklist captures and four Japanese setup-help
cases pass. The image's 54 distinct critical cases pass, including Columbo
request summaries, persisted theme switching, calendar/music, RTL, rating
popover positioning and offline recovery. The first invocation passed 53 and
failed one rating fixture when hover preceded the catalog response; its trace
is retained. After the test-only settling correction, all four rating cases
pass with unchanged repeated motion/geometry assertions. This is not described
as one clean 54-case initial invocation.

Four persisted-book groups cover 12 SQLite-backed ABS states and four request
dialogs. Four navigation groups cover 12 enabled/disabled/no-provider states;
the actual-image screenshots were inspected in both themes and viewports.
Offline recovery passes three cases at each width, including genuine service-
worker fallback returning to the requested route and direct /offline.html
returning home. The neutral offline page has no account-specific theme.
Book dialogs, navigation states, offline captures and four adapter TLS skin
captures were visually inspected. A compiled production-scanner HTTP/SQLite
proof passes the three ABS evidence/cleanup scenarios on the exact image.

## Resolved reports and contributions

[#409](https://github.com/snapetech-org/seerrng/issues/409#issuecomment-6701620023)
was completed only after v3.72.19 publication and actual-image verification;
v3.72.20 retains the file-evidence and ABS classification repairs.
[#594](https://github.com/snapetech-org/seerrng/issues/594#issuecomment-6702351013)
was completed after v3.72.20 publication and actual-image navigation checks.
The offline utility reload loop was separately reproduced on v3.72.19 and fixed
with six native regression cases and production-browser verification.

All 73 issues have resolving public comments; none is closed as not planned.
All 416 merged PR merge commits are ancestors of the release source. The 99
closed, unmerged PRs have verified explanations of integration or supersession.
Recovered useful work and incoming PRs592/593 preserve original contributor
history. See the [issue ledger](closed-issue-resolution-audit-2026-11-06.md),
[PR ledger](closed-pr-resolution-audit-2026-11-06.md) and
[security review](contribution-security-review-2026-11-06.md).
The security scope includes 57 human contribution records and 144 dependency-bot
diffs; it is not an exhaustive audit of every upstream repository. The final
live sweep found zero open issues, PRs, Dependabot, code-scanning and secret-
scanning alerts. CodeQL remains disabled under the owner's directive.

## Catalog and external-channel bounds

The generic Compose and Cloudron/Co-op candidates pin this manifest. Actual
v3.72.16-to-v3.72.20 upgrade/restart retains the SQLite canary; both adapter HTTPS
fixtures retain secure sessions and theme changes before/after restart. All
24 startup/origin contracts and Compose/Stack parsing pass. Applications run
as UID/GID1000 with zero effective capabilities and read-only root filesystems.
See [catalog qualification](catalog-packaging-recovery-137.md) for bootstrap
capabilities and real-platform/marketplace acceptance exclusions.

Snap was deliberately skipped because its Store export credential is expired.
Chocolatey is not claimed as delivered: v3.72.16 remains unapproved in moderation
and the later submission returned HTTP403. That response alone does not prove an
expired key. The public verifier stopped during the large Windows archive
transfer, before installer setup; no installer-code defect was established.
Launchpad remains asynchronous and is monitored separately. No unchanged failed
store submission was repeatedly retried or moderation bypassed.

Live household Plex/Jellyfin/Chaptarr/ABS playback, physical mobile handoff,
every operating-system version, real Cloudron backup restore and a deployed
Swarm/Traefik stack are outside these fixture/emulator checks. Provider service
fixtures do not establish successful live provider authentication.

## Retained evidence

Evidence is retained on kspld0 under
`/mnt/disks/scratch/task-deliverables/seerrng-incoming-review-20261106`:
`release20-complete-ci.log`, `release20-release-live.json`, published20 image,
manifest/CSS/theme/compiled-scanner receipts, `published20-native`, the static
and dynamic comparison indices/contact sheets, `published20-settled-states`,
`published20-final-visual`, adapter restart/TLS logs and screenshots, public
issue/PR readbacks and merged-PR ancestry results. Earlier baseline failures
remain available alongside corrected checks rather than being overwritten.
