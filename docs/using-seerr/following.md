---
title: Following
description: Follow people, production companies, TV networks, genres, narrators, series, games, artists, and patch projects and read why each update appeared.
sidebar_position: 14
---

# Following

**Following** (sidebar, under *My Library*) lists personal news and what you follow. The sidebar shows an unread count.

## What you can follow

| Follow | Where the button is | You are told when |
| --- | --- | --- |
| A narrator | An edition card; a series narrator panel | They narrate a new audiobook |
| An author | A book page (**Follow New Releases**) | They have a new work |
| A series in a language | The anime continuation panel (**Follow Future Translated Volumes**) | A volume is announced or released in that language |
| Game content | A game's **Editions and Content** panel | A new expansion appears |
| An artist | An artist page (**Follow New Albums**); Collector Picks | A new album appears (singles, compilations, live albums, and reissues are left out) |
| A patch project | A patch card; **Translations & Hacks** | A new version is published |
| A franchise | The franchise page | A new connection is documented |
| A saved game search | Game Finder | A new game matches |
| A TMDB person (cast or crew) | A person page | A recent title, upcoming title, or listed release date is found |
| A TMDB production company | Its movie studio page | A recent or upcoming movie or series, or a listed release date, is found |
| A TV network | Its series page | A recent or upcoming series, or a listed first-air date, is found |
| A movie or series genre | Its genre page | A recent or upcoming title, or a listed release date, is found |

Each news item says why it appeared and links to the place you can request it.

Person follows include both cast and crew credits for movies and series. Studio
follows use TMDB production-company credits, including series when TMDB lists
the company there. Network follows cover series, while a genre follow applies
to either movies or series according to the page where you follow it. All of
these use the same personal news feed as other follows.

The first check records what is already known without generating a historical
backlog. It can show up to three current upcoming titles per media type for
each follow. After that, new credits can appear as recent or upcoming items.
For surfaced upcoming items, the feed can add a separate update when the
listed date is reached. Browse older catalog titles on the corresponding
person or Discover pages where those results are available; Following does not
copy an unbounded back catalog or group all past titles by year.

These checks are bounded: they consider movie and series dates from 180 days
ago through 548 days ahead, and inspect at most 20 recent and 20 upcoming
results per media type for each follow on a sync. TMDB may have incomplete or
changing dates. Reaching a listed date does not confirm that a title is
available in your library or ready to request.

## Choices on each follow

- **Notify Me** controls whether new items count as unread.
- **Request Automatically** is available for narrator, author, series, and edition follows only. It goes through the normal request path, so quotas and approval rules apply. It is off by default.
- **Stop Following** removes the follow and its news.
- Person, studio, network, and genre results respect your movie and series maturity limits. A title hidden by those limits is not added to your personal news.

## Notes

- The first check of a follow records a baseline, so you are not flooded with existing items.
- **Notify Me** controls unread status inside Following; it does not send push, email, or other external notifications.
- Following does nothing until the **Followed Interests Sync** job runs; an administrator can run it from **Settings → Jobs & Cache**.
- A source that cannot be checked (for example slskdN being offline) is skipped for that run and tried again.

TMDB title updates recheck the current account maturity cap, age gate, enabled
media categories, and provider identity before becoming news. Stored video news
is checked again when the feed is read, so a later policy change hides the title
without deleting the saved event. Temporary metadata or event-write failures
remain eligible for retry.
