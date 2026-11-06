---
title: Private movie watch sessions
description: Invite household members to choose a movie using private ballots and unanimous results.
---

# Private movie watch sessions

Watch Sessions lets SeerrNG members choose a movie together. It is separate
from personal [Swipe](./swipe.md): each session has its own accepted members,
movie candidates, and private ballots.

This SeerrNG feature adapts the group movie-selection use case proposed in
Seerr [issue #3310](https://github.com/seerr-team/seerr/issues/3310). The
implementation is maintained in this fork and keeps the existing SeerrNG
request permissions, movie-category availability, and age-gate rules in force.

## Start a session

Every participant needs movie request access and the Movies category enabled
for their account.

1. Open **Watch Sessions** from the main menu and create a session with a
   name and optional Discover filters.
2. Choose up to five genres, a ranking, release-year bounds, and a minimum
   TMDB rating. You can edit these filters until the session starts.
3. Create an invitation link and send it privately to the people you want to
   join. Each link can be accepted once, expires within 48 hours, and is
   disabled when the session starts. The session owner can revoke an unused
   link or create a replacement.
4. Invitees open the link, sign in, and accept the invitation. The owner can
   start the session when at least one other eligible member has joined.

The session owner is the first member. A session supports up to 12 members and
expires 14 days after it is created. The raw invitation token is shown only
when its link is created; SeerrNG stores its SHA-256 digest. Keep the link
private because anyone who has it can claim it while it remains open.
When sign-in is needed, the browser keeps the token in tab-scoped storage and
removes it from the address bar before continuing; the token is submitted only
in the invitation-accept request body.

## Choose candidate movies

An active session builds a bounded deck from filtered TMDB movie discovery.
The deck is not an exhaustive list of every movie matching the filters. Each
member reviews the same candidate pool independently and chooses **I'm In** or
**Pass**. Members can review and change their own choices from **Your
Choices**. Their individual choices and totals are not shown to other
members.

During the draft, each member can opt in to anonymously adding titles from
their own SeerrNG movie watchlist. The session does not identify who added a
candidate or reveal another member's watchlist. This preference becomes fixed
when the owner starts the session.

When the session includes a member restricted by the configured age gate, the
shared deck applies that maturity ceiling to everyone. Every current member’s
individual movie maturity cap also applies to the shared deck, private choices,
and matches. A configured account cap requires a recognized US certification;
missing or unknown certifications cannot admit a title. Adult titles and items
above the configured ceiling or flagged with mature terms are filtered from
the shared deck. As with other age-gate checks, incomplete rating or tag data
is handled using the existing best-effort policy described in the
[age-gate guide](./age-gate.md).

Temporarily filtered movies remain in the bounded candidate pool, preserving
existing private ballots if a member’s restrictions change.

## Matches and requests

A movie appears under **Everyone Wants To Watch** only after every current
member has chosen **I'm In**. A pass or a missing vote is not a match. Members
see the unanimous titles, but not who voted for or against a title or how many
votes it received.

A match does not create a request. Open the movie and use the regular SeerrNG
request action. The usual account permissions, availability, quota, approval,
and request-destination rules still apply.

## Manage a session

- Before starting, the owner can edit filters, create or revoke invitation
  links, and remove members.
- A member can leave. The owner can close the session at any time; closing it
  deletes the session's invitations, candidates, and ballots.
- While active, the owner can remove a member and a member can leave. If fewer
  than two members would remain, the session closes. Invitation links stop
  working after the session starts, so a departed member cannot rejoin it.
- A session and its associated data are deleted automatically after their
  expiration date.

If a session or invitation is unavailable, it may have expired, been closed,
or already been used. Ask the owner for a fresh link when needed.
