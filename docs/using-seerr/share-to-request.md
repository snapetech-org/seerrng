---
title: Share to Request
description: Turn a link, ISBN, list of titles, or a photo into requestable matches.
sidebar_position: 11
---

# Share to Request

**Share & Identify** (`/share`) turns whatever you were sent into matches you can request. It never requests anything on its own: you check the matches and choose.

## What you can give it

| Input | What happens |
| --- | --- |
| A Steam, IMDb, TMDB, Letterboxd, Goodreads, Hardcover, bookstore, or Audible link | SeerrNG reads the page (public addresses only, size-limited) and matches the title. IMDb, TMDB, and Letterboxd links resolve exactly. |
| An ISBN | Matched to that book. Check digits are verified. |
| A pasted list, one title per line, with optional `by Author` or `(2021)` | Each title becomes its own group with candidates. |
| A music stream or video link | Handed to SongID, which identifies the recording. |
| A photo or screenshot | Barcodes are read on your device. Text is read by local text recognition (Tesseract) or by the vision provider your administrator enabled. |

Each recognised item is a group of cards showing cover, creator, year, how strong the match is, and why it matched. A clear winner is preselected; an ambiguous item is not. Choose **None of these** to skip an item, and **Book Format** to request ebooks or audiobooks: photograph a paperback and request the audiobook.

## From your phone

- **Android app:** SeerrNG appears in the Share menu for text and images. With one saved server it opens straight to the share page; with several it asks which server.
- **Installed web app (Android Chrome):** after installing SeerrNG to your home screen it appears in the Share menu too.
- **iPhone and iPad:** build a Shortcut. Add the actions *Receive* (links and text from the Share Sheet), *URL Encode*, and *Open URLs* with `https://YOUR-SERVER/share?text=` followed by the encoded input. Photos are best pasted into the share page's text area or chosen with **Add a Photo or Screenshot**.

## Administrators

Links, ISBNs, and lists need no setup. For images, open **Settings → Services → Share and Image Recognition**:

- Install `tesseract` on the SeerrNG host (or in its container) for local reading.
- Optionally choose a vision provider: Anthropic, or any OpenAI-compatible server such as Ollama or LM Studio (a local model keeps images on your network). An external provider requires you to confirm that uploaded images may be sent to it. Images are processed in memory and never stored.

## Browser extension

[SeerrNG Companion](https://github.com/snapetech-org/seerrng-companion) adds a request button to title pages on other sites and a right-click **Find in SeerrNG** item, using the same `/api/v1/resolve` endpoints.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
