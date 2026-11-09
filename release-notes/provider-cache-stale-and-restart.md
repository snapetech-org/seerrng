---
category: fixed
audience: users
area: discovery
action: none
breaking: false
---

Discovery, title pages and book lists no longer stall for many seconds after a restart or when a provider cache entry expires. Provider metadata (TMDB, TVDB, TVmaze, Open Library, Wikidata, MusicBrainz, Cover Art Archive, Rotten Tomatoes and IMDb) is saved under the config folder and restored at startup, and an expired answer is used only while its own refresh is slow (over 0.75 seconds) or failing.
