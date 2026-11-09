---
title: Swipe
description: Swipe through requestable movies, books, music, comics, games, and more.
sidebar_position: 10
---

# Swipe

**Swipe** is a card based way to find and request media. The category rail shows
the catalogs enabled for your account. Each category uses the same discovery
source and request rules as the rest of SeerrNG, so the usual permissions,
quotas, approvals, and service destinations still apply.

| Action | Gesture | Button | Key |
| --- | --- | --- | --- |
| Request it | Swipe right | **Request** | → |
| Not interested | Swipe left | **Pass** | ← |
| Already watched or read it | Swipe up | **Seen It** | ↑ |
| Bring back the last pass or seen card | — | **Undo** | Backspace |

On touch screens, drag the top card in the direction you want. The buttons and
keyboard work too. The card body remains scrollable when a description is long.

## Categories

Swipe includes the requestable SeerrNG catalogs:

- **Movies** and **Series**, with picks from TMDB.
- **Books** and **Audiobooks**, from Open Library and configured book services.
- **Comics**, from ComicVine.
- **Magazines**, from LazyLibrarian's tracked catalog or a public Google Books
  search. Public search needs a Google Books API key and a configured
  LazyLibrarian request destination.
- **Music**, from MusicBrainz and ListenBrainz, routed through configured
  Lidarr services.
- **Sports**, from Sportarr. Search for a team, league, or competition to start.
- **Retro** and **Modern** software, from the configured ROMarr catalog. Choose
  a supported system before requesting a title.
- **PC Games**, from the configured IGDB catalog. Choose the operating system
  and architecture before requesting.
- **Adult**, from Whisparr. Search for scenes to review.

Categories appear only when enabled and available to your account. Adult cards
also require adult request access. Titles already available, actively tracked,
or already requested are filtered out when the source provides that status.

## Search and filters

Use the search field to search the current catalog. **Filters** adds category
appropriate controls such as subject or genre, release year, minimum rating,
comic publisher, and magazine catalog source. Press **Reset** to clear the
draft, then **Apply filters** to update the deck. **New Picks** loads a fresh
set while keeping the current category filters.

Some sources require a query. Sports search needs a team, league, or competition;
adult search looks up scenes in Whisparr; public magazine search needs a title.
An empty result does not create a placeholder card, and the search remains
available from the empty state.

## Requests and history

A right swipe submits through the normal request API. Book format and TV season
preferences are applied to their requests. Software requests use their specific
system or PC variant picker. A failed request keeps the card in the deck.

**Undo** brings back only your latest pass or seen card. Requests remain in
**Requests**, where they can be managed or canceled. **History** lists previous
decisions; you can restore a pass or seen title to the deck, or clear passes and
seen decisions for the current category. Requested titles stay in Requests.

## Recommendations and privacy

Movie, series, and book decks can use your library, prior decisions, and
optional taste notes to find and order recommendations. When AI ordering is
enabled, SeerrNG sends the eligible movie, series, or book candidates and the
relevant recommendation signals to the configured AI provider. The provider
only reorders those catalog results; it cannot create requestable titles. If
ranking is unavailable or returns an unusable result, the normal catalog order
is used.

Adult search and adult Swipe history stay within SeerrNG and are visible only
to accounts with adult request access. Adult titles, activity, and searches are
never sent to AI ordering. Taste notes and recommendation preferences are not
offered from the Adult category.

## Preferences

For movie, series, and book recommendations, **Preferences** lets you choose
recommendation seeds and optional taste notes. For series, choose whether a
request includes the first season or every season. For books, choose the
preferred request format from the formats enabled by your administrator.

## For administrators

Swipe is on by default. Turn it off, or configure AI ordering, under
**Settings → Services → System → Swipe Discovery**.

AI ordering is optional. Choose a provider:

- **Anthropic Claude**: enter an Anthropic API key. The default model is
  `claude-opus-5-5` at Low effort.
- **OpenAI or compatible**: enter the base URL and model name. Use
  `https://api.openai.com/v1` with an OpenAI key, or a local OpenAI-compatible
  server such as Ollama (`http://ollama:11434/v1`) or LM Studio, which usually
  need no key. SeerrNG asks for a JSON-schema reply and falls back to plain JSON
  mode for servers that do not support schemas.

The model receives no Adult catalog data. Other categories use their configured
discovery providers directly and do not enter the AI ranking path.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
