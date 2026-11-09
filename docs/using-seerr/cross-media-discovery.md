---
title: Continue, Compare, and Follow
description: Source material for anime, edition and narration choices, game content, translations, and personal news.
sidebar_position: 12
---

# Continue, Compare, and Follow

## Continue an anime

On an anime's page, **Continue With the Manga or Novels** asks which season you finished. SeerrNG shows the source manga or light novel, where that season ends in it when MangaUpdates documents it, and the volume that continues the story.

- A documented start (for example, "Volume 7, chapter 61") is shown as documented.
- When only the end is documented, SeerrNG shows the next chapter and says the volume is not documented. It never invents a volume.
- If a season's end is unknown, you still get the source series.
- Light novels use RanobeDB for volumes and language-specific releases. If the next volume has no release in your language yet, you can **Follow Future Translated Volumes**.

The **Franchise** page groups original works, adaptations, sequels, and side stories. Administrators can confirm or hide a link; hidden links stay hidden.

## Editions and narrations

When you request a book, edition cards show narrator, full-cast or solo, abridged or unabridged, length, language, and publisher. Anything the catalog does not provide is listed as not provided. When a version is already in the library you choose how the new one relates:

- **Only this version** replaces the selection.
- **Either of these** accepts whichever is found first.
- **Keep this alongside the existing version** tracks a second performance (needs Chaptarr).

Audiobook series pages compare narrators across the whole series: which volumes each narrator covers, which are missing, and which exist only in another narration. Users with advanced request access can **Collect With** a narrator to make it the series preference.

Album pages compare standard, deluxe, and remaster releases using MusicBrainz track lists and let you request a specific release; Lidarr then monitors that exact release.

## Games and patches

A PC game request can ask for editions and content (needs QuestarrNG): the base game only, only the expansions you select, or a complete edition. Story content, cosmetic content, and content the catalog does not describe are labelled separately, and unknown edition contents stay unknown.

**Translations & Hacks** lists fan translations, ROM hacks, and improvement patches from your ROMarrNG patch catalogue (see ROMarrNG's *patch catalogue* guide). Pick a version, keep the original alongside it, and follow a project for new versions. Completeness is only what the project states.

**Game Finder** saves searches by themes, modes, perspectives, languages, and length, with visible exclusions, and tells you what matched.

## Hardcover book recommendations and Collector Picks

**Book Recommendations** shows your personal, featured, and popular Hardcover recommendation feeds using the token saved on your Hardcover list. You can filter for standalones, first books in a series, less popular books, and specific authors, then mark books as more or less like the ones you want. Creating a personalized feed on Hardcover requires a Supporter account.

**Collector Picks** shows releases shared by collectors you follow in slskdN, with the reasons they appeared.

## Following

**Follow** buttons (narrators, authors, series in a language, game expansions, artists, patch projects, franchises) feed the **Following** page: personal news that says why each item appeared. Auto-request is off by default, applies to books only, and still follows your quota and approval rules.

## Accessibility and keyboard

- Every card choice is a native radio or checkbox inside a labelled group, so arrow keys and Space work and screen readers announce the group, the item, and whether it is selected. A visible focus ring is drawn on the focused card, thicker when it is also selected.
- Buttons that repeat on a list (**Request**, **More like this**, **Follow**) carry the item's title in their accessible name.
- Results, unread counts, and errors are announced through polite live regions; focus moves to the results heading after a search.
- Confidence badges explain their meaning on hover and to assistive technology. Anything not provided by a catalog is written out as "not provided" instead of left blank.
- The file picker is a real button, and drag-and-drop is optional.

See also [what each feature needs](./cross-media-requirements.md), [Following](./following.md), and [troubleshooting](./cross-media-troubleshooting.md).

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [exact-edition request recovery contribution #633](https://github.com/snapetech-org/seerrng/pull/633) — [@ncbudd](https://github.com/ncbudd).

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
