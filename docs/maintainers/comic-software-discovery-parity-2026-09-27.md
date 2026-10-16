# Comic and software discovery parity audit (2026-09-27)

This audit compares the current comic, ROM, and PC game discovery paths with movie and TV discovery. It records implemented behavior and remaining product gaps; provider live availability was not tested.

| Capability | Movies and TV | Comics | ROMs and PC games |
| --- | --- | --- | --- |
| Catalog lookup | TMDB discover and search | ComicVine volume search and a durable local index for metadata filters | QuestarrNG IGDB search and popular; ROMarrNG systems constrain ROM requests |
| Incremental results | Paginated `useDiscover` list | Paginated `useDiscover` volume search and lazy, paged back-issue list; publisher, year, and issue-count filters use the completed local index | Cursor-paged search and offset-paged popular titles with platform, genre, and release-year filtering in the current QuestarrNG contract; older builds retain the first window |
| Returning from details | Loaded pages and scroll restored | Loaded pages and scroll restored | Software title details have a shareable catalog URL; closing details keeps the current catalog list in memory |
| Metadata cache | Bounded TMDB cache | Bounded ComicVine cache and resumable SQLite/Postgres volume index | Bounded 10-minute QuestarrNG catalog cache and 5-minute ROMarrNG system cache |
| Covers | Lazy browser images, optional image proxy, bounded prewarming | Same path for ComicVine hosts | Same path for IGDB covers; detail screenshots load only when opened |
| Request progress and availability | Shared media request lifecycle | Shared media request lifecycle | Dedicated durable software request lifecycle and request status cards; bounded provider library lookups show existing QuestarrNG and ROMarrNG availability on catalog titles |

## Remaining gaps

1. **Paged provider rollout.** QuestarrNG's [SeerrNG integration API](https://github.com/snapetech-org/QuestarrNG/blob/main/docs/API.md#seerrng-software-provider-contract) now includes paged search and popular endpoints with platform, genre, and release-year filters. SeerrNG shows the full 50-title legacy window against older QuestarrNG builds for unfiltered browsing. Filtered browsing requires the current contract. Verify a deployed QuestarrNG build before treating live software paging as complete.
2. **First comic index build.** Publisher, year, and issue-count controls now use a durable local volume index. The first filtered search starts the scan. Filtered results remain unavailable until the first scan completes; the UI shows progress. The index refreshes after 30 days while serving the last complete generation.
3. **Provider rollout and incomplete inventories.** Existing QuestarrNG and ROMarrNG library availability appears after both providers expose their bounded lookup contracts. ROMarrNG reports when its cache is still loading or partial, so unmatched titles remain unknown until its library is complete. Live provider behavior still needs deployment verification.

ComicVine volume discovery and back-issue browsing are paged and cached. Requests acquire full volumes, matching the selected product scope.
