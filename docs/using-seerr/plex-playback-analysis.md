---
title: Plex Playback Analysis
description: Queue season analysis when someone starts watching an enabled Plex TV library.
---

# Plex Playback Analysis

An administrator can enable **Settings → Plex → Analyze Seasons During Playback**.
The option is off by default. While enabled, SeerrNG checks active Plex episode
playback once a minute and asks Plex to analyze the playing season. Only enabled
TV libraries participate. Paused sessions do not trigger analysis.

Plex runs the analysis asynchronously. Its own library settings, agents and
subscription requirements determine which intros, credits or other analysis
results it generates. This option cannot guarantee markers before the current
episode finishes, and it does not change Plex's scheduled analysis settings.
See [Plex analysis](https://support.plex.tv/articles/200289336-analyze-media/)
and [intro detection](https://support.plex.tv/articles/skip-content/).

SeerrNG submits at most two seasons per check and remembers successful submissions
for 30 days. Failed or interrupted submissions wait at least a day before another
attempt. This state survives restarts, is scoped to the configured Plex server,
and expires after 180 days without another attempt. The state store is capped at
10,000 season records. Turning the option off stops future submissions; it cannot
cancel work already queued inside Plex.

The server owner's current Plex credentials authorize the operation. A changed
server or revoked owner credential stops the check. SeerrNG validates episode,
season, show and library identities before issuing the analysis request. The
**Plex Playback Analysis** job in Jobs & Cache controls the polling schedule.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
