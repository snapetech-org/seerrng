# Closed Issue Resolution Audit — November 6, 2026

This document records the November 6 inventory of 73 issues, including every
closed issue. Its source/comment reconciliation is not a completed human-workflow
audit. The November 7 follow-up below supersedes blanket completion readings. The
audit checked the requested behavior against current source and the earlier
behavioral verification records, then read back the public issue threads.

- At the November 6 snapshot, 73 issues were closed with an explanation or fix reference.
- 36 missing or stale public explanations were added and read back.
- 35 existing resolution explanations were retained.
- Issue #409 was reopened for its availability defects, then resolved in v3.72.19
  after final CI, publication and downloaded-image verification.
- Issue #594 is resolved in v3.72.20 after publication and actual-image checks.
- The ten resolving pull requests referenced by the selected comments were
  independently confirmed merged, with their merge commits in `v3.72.15`.
  Explicit commit links and recorded source/test paths were also checked
  against that published tag; the moved AdvancedRequester owner was resolved
  to its current directory entry point.

This is an issue-resolution audit, not proof that every historical pull request
is integrated or that every integration works against a live provider. Existing
focused tests, production/browser checks and provider limitations remain scoped
as described in each issue. The separate UI replacement build is tracked in
[Compact Summary Theme Validation](compact-summary-theme-validation.md).

## Follow-Up Status

[#409](https://github.com/snapetech-org/seerrng/issues/409) is resolved by the
provider-scoped lookup repair, per-format file evidence and the ABS audio-file
follow-up published in v3.72.19. Its
[final receipt](https://github.com/snapetech-org/seerrng/issues/409#issuecomment-6701620023)
links the commits, full CI, release, production-image proof and rescan action.

[#594](https://github.com/snapetech-org/seerrng/issues/594) was reported during
the final sweep. The shared navigation filter now applies category/service
eligibility to Book Recommendations and Collector Picks. Its
[final receipt](https://github.com/snapetech-org/seerrng/issues/594#issuecomment-6702351013)
links the fix, full CI, published replacement and actual-image browser checks.
At that snapshot all 73 were closed as completed; this historical count is not the current acceptance result.

## Human-workflow follow-up — November 7

The earlier source links and public-comment readback did not prove every human
entry point, action, persistence result or recovery path. Rechecking all 73
issues through those paths is in progress; closed counts are not acceptance.

- #500 was reopened after the actual v3.72.21 image hid Queue Collection under
  Orig's generic Details disclosure. The candidate restores the visible header
  action; John keeps its existing control. This is not yet a published fix.
- #498 was reopened for a save-flow defect: saving Plex also validated the
  unused Tautulli form, whose subsequent invalid state blocked later Plex saves.
  Both released themes reproduced this with real settings persistence and an
  isolated Plex fixture. The candidate submits changed forms independently and
  preserves unsuccessful drafts. This is not yet a published fix.
- #503 is verified already implemented in the current Requests page: Requests
  → TV request → Episode Queue → Queue Length → Save Changes. Four phone/desktop
  and Orig/John cases saved a real isolated record, reloaded it, and restored
  the account default. Four additional cases verified non-admin HTTP 403 and
  failed-save recovery. The initial follow-up mistakenly inspected the legacy
  request list; its duplicate candidate was removed and the public comment
  corrected. [Human-path receipt](https://github.com/snapetech-org/seerrng/issues/503#issuecomment-6713701679).
- New #597 tracks confirmed comic completion and notification defects missed by
  the previous scope. Service acceptance set COMPLETED and emitted an available
  notification; the notification title used a backend numeric ID. The candidate
  requires destination-specific file evidence, repairs legacy rows on rescan,
  uses readable metadata, and retires stale availability intents.

Headless evidence, including failed baselines, is retained on kspld0 under
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/`.
Tests use isolated records/provider fixtures, not household acquisitions. A
rendered route or a source-only feature must not be counted as a completed
interaction workflow. Remaining issues require their own verification record.

## Resolution Ledger

Each entry links directly to its public resolution comment. “Resolved” includes
a documented fallback where an external provider restricts access; it does not
claim that the provider restriction disappeared. #124 records a bounded retest
and a crash that could not be reproduced, rather than a proven crash repair.
YunoHost packaging in #153 was superseded by the later explicit owner retirement
directive; it must not be restored merely to satisfy the original feature request.

| Issue | Disposition | Public resolution |
| --- | --- | --- |
| [#52 — Vertical scrolling broken on touch devices (iOS): PullToRefresh preventDefaults all swipes since c291edcb](https://github.com/snapetech-org/seerrng/issues/52) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/52#issuecomment-5072031233) |
| [#53 — Book requests render as empty cards in request lists: media.identifiers not loaded (relationLoadStrategy 'query' + nested relation)](https://github.com/snapetech-org/seerrng/issues/53) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/53#issuecomment-5072031440) |
| [#91 — Request status not updated after submission until download starts](https://github.com/snapetech-org/seerrng/issues/91) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/91#issuecomment-6693189581) |
| [#92 — Feature request: Chaptarr integration for ebooks/audiobooks](https://github.com/snapetech-org/seerrng/issues/92) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/92#issuecomment-5542280536) |
| [#95 — Adult=True](https://github.com/snapetech-org/seerrng/issues/95) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/95#issuecomment-5482823875) |
| [#96 — Jellyfin setup fails with "port must be an integer between 1 and 65535" despite valid port](https://github.com/snapetech-org/seerrng/issues/96) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/96#issuecomment-6693192326) |
| [#104 — FR: Add a request status page so users can follow their downloads](https://github.com/snapetech-org/seerrng/issues/104) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/104#issuecomment-5556595688) |
| [#105 — Cannot log in with Jellyfin](https://github.com/snapetech-org/seerrng/issues/105) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/105#issuecomment-5594403576) |
| [#110 — Add Plex Integration for Music &amp; Audiobooks](https://github.com/snapetech-org/seerrng/issues/110) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/110#issuecomment-6693188739) |
| [#116 — Chaptarr book requests fail on large libraries because addBook fetches entire /book collection and exceeds 16 MiB maxContentLength](https://github.com/snapetech-org/seerrng/issues/116) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/116#issuecomment-6693187755) |
| [#124 — Media loading extremely slow](https://github.com/snapetech-org/seerrng/issues/124) | historical bounded retest; crash not reproduced | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/124#issuecomment-5819145607) |
| [#126 — Plex Library sync fails](https://github.com/snapetech-org/seerrng/issues/126) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/126#issuecomment-5823941237) |
| [#132 — Make the whole request button clickable if only one quality is chosen](https://github.com/snapetech-org/seerrng/issues/132) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/132#issuecomment-5839598363) |
| [#140 — Books don't disappear on left even though not enabled](https://github.com/snapetech-org/seerrng/issues/140) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/140#issuecomment-5917392658) |
| [#141 — Discovery searches find things that are disabled](https://github.com/snapetech-org/seerrng/issues/141) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/141#issuecomment-5917392654) |
| [#142 — Discovery Searches don't seem to work great for Audiobooks](https://github.com/snapetech-org/seerrng/issues/142) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/142#issuecomment-5917396850) |
| [#143 — Book and Author Search](https://github.com/snapetech-org/seerrng/issues/143) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/143#issuecomment-5917392713) |
| [#144 — Audiobook requests no longer sent to BookshelfNG](https://github.com/snapetech-org/seerrng/issues/144) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/144#issuecomment-5917392640) |
| [#146 — Software Request Reconciliation job fails every minute: "COALESCE(request" alias was not found (orderBy expression in refreshTrackedSoftwareRequests)](https://github.com/snapetech-org/seerrng/issues/146) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/146#issuecomment-5917396911) |
| [#153 — Please transfer it out of ynh-org](https://github.com/snapetech-org/seerrng/issues/153) | superseded: owner retired YunoHost packaging | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/153#issuecomment-6693251889) |
| [#159 — Per user list importing](https://github.com/snapetech-org/seerrng/issues/159) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/159#issuecomment-5995811699) |
| [#160 — Software search says "catalog could not be loaded" for some PC games (Prison Architect)](https://github.com/snapetech-org/seerrng/issues/160) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/160#issuecomment-5995813166) |
| [#161 — Can't connect to BookshelfNG (401) because the API key is sent in the URL instead of the header](https://github.com/snapetech-org/seerrng/issues/161) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/161#issuecomment-5977000179) |
| [#164 — v3.52.1 fails to start on PostgreSQL: DataTypeNotSupportedError: Data type "datetime" in "ReaderDeliveryGrouping.updatedAt"](https://github.com/snapetech-org/seerrng/issues/164) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/164#issuecomment-6045546394) |
| [#169 — Creating local user with password setup link crashes SeerrNG when recipientName is undefined](https://github.com/snapetech-org/seerrng/issues/169) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/169#issuecomment-6693186732) |
| [#170 — Lidarr library scan fails when album response exceeds 64 MiB](https://github.com/snapetech-org/seerrng/issues/170) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/170#issuecomment-6693185846) |
| [#174 — IMDB watch list import not working](https://github.com/snapetech-org/seerrng/issues/174) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/174#issuecomment-6693184963) |
| [#179 — IMDb did not return a public watchlist page](https://github.com/snapetech-org/seerrng/issues/179) | resolved with documented provider limitation | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/179#issuecomment-6073053841) |
| [#181 — Shows 29 requests when there are actually 0](https://github.com/snapetech-org/seerrng/issues/181) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/181#issuecomment-6693183952) |
| [#191 — Swipe feature cards bottom part translucent so text overlaps](https://github.com/snapetech-org/seerrng/issues/191) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/191#issuecomment-6693183161) |
| [#192 — sorting by tmdb rating problem](https://github.com/snapetech-org/seerrng/issues/192) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/192#issuecomment-6693182413) |
| [#194 — The request service did not respond, please try again.](https://github.com/snapetech-org/seerrng/issues/194) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/194#issuecomment-6693181465) |
| [#195 — Settings Search box no worky](https://github.com/snapetech-org/seerrng/issues/195) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/195#issuecomment-6693180438) |
| [#197 — POST /api/v1/auth/plex response no longer includes email / plexId / requestCount — breaks third-party iOS clients (Pocket)](https://github.com/snapetech-org/seerrng/issues/197) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/197#issuecomment-6693179460) |
| [#198 — \[Docs\]: update docs to mention support of Issuarr (mylar3 update)](https://github.com/snapetech-org/seerrng/issues/198) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/198#issuecomment-6693178346) |
| [#199 — cannot remove locally deleted item form seerrng so it can be requested again](https://github.com/snapetech-org/seerrng/issues/199) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/199#issuecomment-6693193364) |
| [#236 — missaligned media category radio buttons in settings](https://github.com/snapetech-org/seerrng/issues/236) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/236#issuecomment-6693177225) |
| [#237 — Spacer is between catergory and its description instead of directly below its category](https://github.com/snapetech-org/seerrng/issues/237) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/237#issuecomment-6693176123) |
| [#243 — Still getting error "Request Status Could Not Be Loaded"](https://github.com/snapetech-org/seerrng/issues/243) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/243#issuecomment-6194382640) |
| [#294 — Music Request - "No FLAC music service is configured" and "No MP3 music service is configured" when searching for specific artists, albums, or discography](https://github.com/snapetech-org/seerrng/issues/294) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/294#issuecomment-6197548752) |
| [#295 — ROMarrNG connection test times out: /catalog/dat/platforms takes 13-56s, and integration key gets 401 on /api/platforms](https://github.com/snapetech-org/seerrng/issues/295) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/295#issuecomment-6197548591) |
| [#346 — Request Discography - "No FLAC music service is configured" and "No MP3 music service is configured" when requesting discography](https://github.com/snapetech-org/seerrng/issues/346) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/346#issuecomment-6693175125) |
| [#347 — Sportarr can't be added as connection - Quality profile can't be selected before connecting](https://github.com/snapetech-org/seerrng/issues/347) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/347#issuecomment-6693174142) |
| [#348 — Cannot change sonarr instance when requesting](https://github.com/snapetech-org/seerrng/issues/348) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/348#issuecomment-6247540800) |
| [#351 — Feature request: native Bindery backend for ebook and audiobook requests](https://github.com/snapetech-org/seerrng/issues/351) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/351#issuecomment-6693190367) |
| [#362 — \[CODE\] Add support for OIDC](https://github.com/snapetech-org/seerrng/issues/362) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/362#issuecomment-6393513618) |
| [#363 — \[CODE\] Per‑User Service Integration Configuration](https://github.com/snapetech-org/seerrng/issues/363) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/363#issuecomment-6393514101) |
| [#365 — \[CODE / UX\] New Service Integrations are auto-enabled](https://github.com/snapetech-org/seerrng/issues/365) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/365#issuecomment-6393108281) |
| [#366 — \[CODE\] Indexer Search - improvements](https://github.com/snapetech-org/seerrng/issues/366) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/366#issuecomment-6393514921) |
| [#372 — \[UX\] Settings - Help text alignment](https://github.com/snapetech-org/seerrng/issues/372) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/372#issuecomment-6347763366) |
| [#373 — \[UX\] Color contrast in dropdown lists](https://github.com/snapetech-org/seerrng/issues/373) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/373#issuecomment-6347763458) |
| [#374 — \[UX\] Request Book &gt; Advanced Options button size bugged](https://github.com/snapetech-org/seerrng/issues/374) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/374#issuecomment-6347763330) |
| [#375 — \[CODE\] -IMPORTANT- Inconsistent version availability across all platforms - (UNRAID)](https://github.com/snapetech-org/seerrng/issues/375) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/375#issuecomment-6367011881) |
| [#376 — Audiobookshelf availability scan always fails: SqliteError: cannot start a transaction within a transaction](https://github.com/snapetech-org/seerrng/issues/376) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/376#issuecomment-6347763339) |
| [#382 — Bookshelf-scoped IDs are ignored by book media matching without ISBN](https://github.com/snapetech-org/seerrng/issues/382) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/382#issuecomment-6693191274) |
| [#400 — \[UX\] Settings &gt; Prowlarr &gt; Indexer assignments by medium](https://github.com/snapetech-org/seerrng/issues/400) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/400#issuecomment-6393107271) |
| [#401 — \[UX / CODE\] Blocklist - Show only when used](https://github.com/snapetech-org/seerrng/issues/401) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/401#issuecomment-6393107745) |
| [#409 — Book requests from ChaptarrNG catalogue results fail: lookup uses bare provider id, ChaptarrNG 0.9.977](https://github.com/snapetech-org/seerrng/issues/409) | resolved and published in v3.72.19 | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/409#issuecomment-6701620023) |
| [#412 — Plex Watchlist sync drops every item: ratingKey check only accepts digits, Plex Discover keys are hex](https://github.com/snapetech-org/seerrng/issues/412) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/412#issuecomment-6693173246) |
| [#413 — Adult scene detail fails when Whisparr server ID is 0](https://github.com/snapetech-org/seerrng/issues/413) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/413#issuecomment-6693172350) |
| [#415 — seerrng-migrate.mjs rejects freshly initialized SQLite target: seerr\_migration\_lock counted as user data](https://github.com/snapetech-org/seerrng/issues/415) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/415#issuecomment-6693003820) |
| [#417 — Jellystat watch summary: GET /media/&#123;id&#125;/jellystat missing from seerr-api.yml, validator returns 405](https://github.com/snapetech-org/seerrng/issues/417) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/417#issuecomment-6693171466) |
| [#425 — Native Bindery integration completely broken: "Test" works but saving fails on OpenAPI validation &amp; Outbox crashes](https://github.com/snapetech-org/seerrng/issues/425) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/425#issuecomment-6693002892) |
| [#498 — As needed generation prompt](https://github.com/snapetech-org/seerrng/issues/498) | resolved in v3.72.22; downloaded-image save/repeat-save verified | [Released workflow evidence](https://github.com/snapetech-org/seerrng/issues/498#issuecomment-6715981268) |
| [#499 — filter defaulting to book](https://github.com/snapetech-org/seerrng/issues/499) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/499#issuecomment-6693001079) |
| [#500 — movie collection pull as watched](https://github.com/snapetech-org/seerrng/issues/500) | open; downloaded23 queue/Stop workflow verified; Retry/poll repairs on main pending delivery | [Worker and Stop evidence](https://github.com/snapetech-org/seerrng/issues/500#issuecomment-6718230388) |
| [#501 — all users affect episode on demand pull](https://github.com/snapetech-org/seerrng/issues/501) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/501#issuecomment-6692999052) |
| [#502 — comicvine api key and other key hyperlink](https://github.com/snapetech-org/seerrng/issues/502) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/502#issuecomment-6692997941) |
| [#503 — admin episode queue overide on editing a request](https://github.com/snapetech-org/seerrng/issues/503) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/503#issuecomment-6692996850) |
| [#504 — wizard for beginners as discussed](https://github.com/snapetech-org/seerrng/issues/504) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/504#issuecomment-6692995941) |
| [#511 — Audiobookshelf settings: "Test" fails with \`request/body/port must be number\` after editing the port](https://github.com/snapetech-org/seerrng/issues/511) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/511#issuecomment-6692994826) |
| [#513 — Live Download Progress: qBittorrent 5.2 login rejected (expects 200 'Ok.' + SID cookie; 5.2 sends 204 + QBT\_SID\_&lt;port&gt;)](https://github.com/snapetech-org/seerrng/issues/513) | resolved | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/513#issuecomment-6692993692) |

| [#594 — Media categories filter not applying to menu](https://github.com/snapetech-org/seerrng/issues/594) | resolved in v3.72.20 | [Explanation and evidence](https://github.com/snapetech-org/seerrng/issues/594#issuecomment-6702351013) |

## Evidence and Update Rules

The task evidence retains the live issue snapshot, complete public comment
readbacks, 36 posted-comment receipts, linked-commit ancestry checks, current
source-path checks and ten pull-request merge receipts. The snapshot was taken
on November 6, 2026, against application head `f59078f41` and published release
`v3.72.15`. It contains no unresolved audit-link or source-path errors.

The support-label auto-close/lock workflow has been removed. The inactivity
workflow disables issue and pull-request closure and defaults to a non-mutating
preview. It can mark records for review, but age and labels do not resolve them.

Before closing a new or reopened issue, verify the original requested behavior,
link the resolving commit or merged pull request, describe the resulting
behavior and any limitations, and identify the published release when available.
A duplicate or superseded disposition must identify the resolving replacement.
If the claimed resolution is incomplete, reopen the issue instead of recording
another unconditional completion statement.


The final public-link check read the 72 previously closed issues again and verified every
ledger resolution comment against the live thread. The subsequent final #594
receipt was also read back, bringing the verified total to 73. The 99 historically closed,
unmerged PRs also have verified public receipts: 59 newly posted bodies match
exact readbacks, 36 existing explanations remain intact and four additional
source reconciliations are present. All 416 genuinely merged PRs have their
merge commits in main. These dated counts are a snapshot, not an assertion
about issues created after this audit.
