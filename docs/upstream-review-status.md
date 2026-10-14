---
title: Current SeerrNG Changes in Review
description: A dated index of current SeerrNG pull requests and their public upstream context.
---

# Current SeerrNG Changes in Review

**Status snapshot: October 13, 2026.** Each SeerrNG pull request listed here
was open in review on this date. An open or draft pull request is not a released
feature. Follow its pull request for review and validation status, and use the
release notes to confirm what is available in a SeerrNG release.

This page tracks selected SeerrNG pull requests numbered #244–#284 from this
review period, including this index and the fork-retirement matrix. It is not a
complete list of all open SeerrNG pull requests, a full inventory of upstream
issues, or a user guide. Source links identify the public Seerr issue or pull
request that informed the work; each SeerrNG pull request contains the
implementation details and review evidence.

| SeerrNG change | Summary | Public source context |
| --- | --- | --- |
| [#244](https://github.com/snapetech/seerrng/pull/244) | Optional TV-season request gate based on fresh playback history for the previous regular season. | [Seerr issue #3590](https://github.com/seerr-team/seerr/issues/3590) |
| [#245](https://github.com/snapetech/seerrng/pull/245) | Make SQLite push-subscription migrations tolerate an absent index during upgrade and rollback. | [Seerr issue #3559](https://github.com/seerr-team/seerr/issues/3559), closed as not planned. |
| [#246](https://github.com/snapetech/seerrng/pull/246) | Process Jellyfin Recently Added Season and Episode records through their parent series. | [Seerr issue #3547](https://github.com/seerr-team/seerr/issues/3547) and [Seerr PR #3551](https://github.com/seerr-team/seerr/pull/3551). |
| [#247](https://github.com/snapetech/seerrng/pull/247) | Match Radarr and Sonarr override rules to the selected request destination while preserving explicit choices. | [Seerr PR #3538](https://github.com/seerr-team/seerr/pull/3538), [Seerr PR #3539](https://github.com/seerr-team/seerr/pull/3539), and related [issue #3548](https://github.com/seerr-team/seerr/issues/3548). |
| [#248](https://github.com/snapetech/seerrng/pull/248) | Accept a trailing slash in the YouTube URL setting while retaining URL validation. | [Seerr issue #3549](https://github.com/seerr-team/seerr/issues/3549) and [Seerr PR #3557](https://github.com/seerr-team/seerr/pull/3557). |
| [#249](https://github.com/snapetech/seerrng/pull/249) | Respect terminal color conventions for console logs while keeping file logs plain. | [Seerr issue #3537](https://github.com/seerr-team/seerr/issues/3537) and [Seerr PR #3563](https://github.com/seerr-team/seerr/pull/3563). |
| [#250](https://github.com/snapetech/seerrng/pull/250) | Centralize Plex, Jellyfin, and Emby display names so labels stay consistent across the interface. | [Seerr issue #3327](https://github.com/seerr-team/seerr/issues/3327) and [Seerr PR #3564](https://github.com/seerr-team/seerr/pull/3564). |
| [#251](https://github.com/snapetech/seerrng/pull/251) | Improve keyboard and touch access to tooltips and interactive download details. | [Seerr PR #3562](https://github.com/seerr-team/seerr/pull/3562). |
| [#252](https://github.com/snapetech/seerrng/pull/252) | Add Traditional Chinese email and web-push notification translations. | [Seerr Weblate PR #3613](https://github.com/seerr-team/seerr/pull/3613). |
| [#253](https://github.com/snapetech/seerrng/pull/253) | Regroup primary navigation and add Discover/Swipe tabs for supported media discovery pages. | SeerrNG-specific navigation and discovery work. |
| [#254](https://github.com/snapetech/seerrng/pull/254) | Route movie and TV requests to labeled services with destination permissions and destination-aware availability. | [Seerr PR #3560](https://github.com/seerr-team/seerr/pull/3560). |
| [#255](https://github.com/snapetech/seerrng/pull/255) | Add optional Slack approval and decline actions using mapped SeerrNG accounts and the normal permission-checked request transition. | [Seerr issue #3554](https://github.com/seerr-team/seerr/issues/3554). |
| [#256](https://github.com/snapetech/seerrng/pull/256) | Document Telegram Thread/Topic ID and Embed Poster settings. | [Seerr PR #3550](https://github.com/seerr-team/seerr/pull/3550). |
| [#257](https://github.com/snapetech/seerrng/pull/257) | Publish a dated index of selected upstream work and evidence-based criteria for retiring the core fork. | SeerrNG-specific documentation; source context is linked throughout this index. |
| [#258](https://github.com/snapetech/seerrng/pull/258) | Avoid multiplying library-season and requested-season rows in request detail and status queries. | [Seerr issue #3515](https://github.com/seerr-team/seerr/issues/3515). |
| [#259](https://github.com/snapetech/seerrng/pull/259) | Use Jellyfin's current authorization format for server API, logout cleanup, and authenticated avatars while preserving Emby compatibility. | [Seerr PR #3502](https://github.com/seerr-team/seerr/pull/3502), [Seerr PR #3503](https://github.com/seerr-team/seerr/pull/3503), and [Jellyfin issue #15962](https://github.com/jellyfin/jellyfin/issues/15962). |
| [#260](https://github.com/snapetech/seerrng/pull/260) | Add title search, media-type filters, and stable sorting to local-only watchlists while preserving existing ordering when Plex lists are combined. | [Seerr PR #3506](https://github.com/seerr-team/seerr/pull/3506), closed without merge. |
| [#261](https://github.com/snapetech/seerrng/pull/261) | Add opt-in display-name and profile-photo refresh for selected linked Jellyfin and Emby users while preserving SeerrNG-owned account fields. | [Seerr PR #3514](https://github.com/seerr-team/seerr/pull/3514) and its related [issue #2764](https://github.com/seerr-team/seerr/issues/2764). |
| [#262](https://github.com/snapetech/seerrng/pull/262) | Resolve missing TVDB IDs through verified TVDB or selected-Sonarr lookups; retain unresolved requests and check fallback season numbering before dispatch. | [Seerr issue #3488](https://github.com/seerr-team/seerr/issues/3488), [PR #3489](https://github.com/seerr-team/seerr/pull/3489), and [PR #3490](https://github.com/seerr-team/seerr/pull/3490). |
| [#263](https://github.com/snapetech/seerrng/pull/263) | Record bounded, read-only request failure categories without persisting raw provider messages, and clear the category when work resumes. | [Seerr PR #3493](https://github.com/seerr-team/seerr/pull/3493). |
| [#264](https://github.com/snapetech/seerrng/pull/264) | Explain recorded failure reasons across request cards, lists, and management views; guide TV season mismatches to another listing and suppress the deterministic retry. | [Seerr PR #3494](https://github.com/seerr-team/seerr/pull/3494). |
| [#265](https://github.com/snapetech/seerrng/pull/265) | Use bounded Node test workers in the repository's hosted validation workflow. | SeerrNG-specific validation-engine maintenance. |
| [#276](https://github.com/snapetech-org/seerrng/pull/276) | Let users recover eligible TV requests by selecting a verified TVDB series and mapping requested seasons for the chosen Sonarr destination and quality. Extend Sonarr scanning to correlate a series with each matching SeerrNG media record. | [Seerr PR #3495](https://github.com/seerr-team/seerr/pull/3495) and [Seerr PR #3496](https://github.com/seerr-team/seerr/pull/3496). |
| [#277](https://github.com/snapetech-org/seerrng/pull/277) | Continue Radarr/Sonarr acquisition when optional requester-tag lookup or creation fails, preserving configured and request-selected tags. | [Seerr PR #2681](https://github.com/seerr-team/seerr/pull/2681) and its linked [issue #2664](https://github.com/seerr-team/seerr/issues/2664). |
| [#279](https://github.com/snapetech-org/seerrng/pull/279) | Add a per-account browser preference to hide or show subject tags across Movie and Series detail pages. | [Seerr issue #2651](https://github.com/seerr-team/seerr/issues/2651) and closed [Seerr PR #3071](https://github.com/seerr-team/seerr/pull/3071). |
| [#281](https://github.com/snapetech-org/seerrng/pull/281) | Add tenth-point TMDB rating thresholds and region-scoped streaming-service exclusion to Movie and Series Discover filters. | [Seerr PR #626](https://github.com/seerr-team/seerr/pull/626) and [issue #898](https://github.com/seerr-team/seerr/issues/898). |
| [#282](https://github.com/snapetech-org/seerrng/pull/282) | Add private, self-scoped, one-time availability subscriptions for another user's active movie or series request, using the subscriber's own Media Available notification preferences. | [Seerr issue #3091](https://github.com/seerr-team/seerr/issues/3091), closed as a duplicate of [issue #375](https://github.com/seerr-team/seerr/issues/375). |
| [#283](https://github.com/snapetech-org/seerrng/pull/283) | Add MusicBrainz and Cover Art Archive connectivity tests plus bounded, administrator-configurable Cover Art Archive concurrency and request-rate limits. | [Seerr PR #3110](https://github.com/seerr-team/seerr/pull/3110) and [Seerr PR #3116](https://github.com/seerr-team/seerr/pull/3116). |
| [#284](https://github.com/snapetech-org/seerrng/pull/284) | Preserve Web Push subscriptions on sibling devices with the same user-agent and replace stale endpoints by matching subscription identity, including across user-agent changes. | [Seerr issue #2660](https://github.com/seerr-team/seerr/issues/2660) and merged [Seerr PR #3142](https://github.com/seerr-team/seerr/pull/3142); the registration fix is adapted here, while SeerrNG already had account-scoped logout cleanup. |

For current supported behavior, start with the [documentation index](./README.md).
For SeerrNG's upstream relationship and the evidence needed before the core
fork could be retired, see [Why SeerrNG Is a Fork](./fork-rationale.md).
