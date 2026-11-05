---
title: Movie Collection Queue
description: Request a movie collection gradually as you watch it.
---

# Movie Collection Queue

Open a collection and choose **Queue Collection**. Select HD or 4K and a buffer of
one or two movies, then start. SeerrNG snapshots the collection in release order
and requests only enough unwatched movies to fill that buffer. The queue uses
your account and normal request destinations. The existing bulk request action
remains available when you want to request every selected movie immediately.

Link your Plex, Jellyfin, or Emby account first. Your own confirmed watched history
advances the queue. Available movies and pending requests—including requests that
still need approval—count toward the buffer. Every new request follows the normal
permission, quota, maturity, blocklist, approval and service checks. A waiting queue
retries later; it does not bypass those checks or guarantee download completion.

The dialog shows progress and waiting reasons. **Stop Queue** prevents future
requests without deleting existing requests or files. If an earlier queued request
is cancelled or an interrupted admission cannot be confirmed, the queue stops
rather than recreating it automatically. Restarting is an explicit instruction to
try missing movies again. All Movies Queued means every snapshot item was watched
or admitted; it does not mean every movie has finished downloading.

A queue contains at most 500 movies, and an account can have at most 20 active
queues. The Movie Collection Queue job checks up to 20 queues per run with a shared
budget of 40 playback-history reads. Large watched collections can take several
checks to catch up. Progress survives restarts. New movies added to the collection
after enrollment are included only when you restart the queue.
