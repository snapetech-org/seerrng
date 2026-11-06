# SeerrNG PR #418 W2200–2299 independent cross-review

- Exact PR head/tree reattested: 8c27beb8086ea6f840bdcde4b915d83db27f81a3 / 2951195dd04af87add189090756e0d0f43e8e031.
- Scope: 100 English source entries × 12 direct locales = 1,200 cells.
- Primary and independent four-locale packet checksums validate.
- Source positions, catalog readbacks, source/catalog/file hashes, all 345 caller line refs, and all nine caller file pins match.
- Placeholder, markup, and protected-literal checks pass for all reviewed targets.
- Primary dispositions: {'accept-current': 938, 'propose-correction': 252, 'propose-refinement': 10}.
- Cross-review dispositions: {'accept-current': 916, 'accept-primary-proposal': 261, 'propose-correction': 22, 'counterproposal': 1}; explicit holds: 0.

## Corrections and alternate wording

All primary proposals are accepted except the Japanese music-runtime candidate. These corrections were found among primary accept-current rows:

- zh_Hant components.MovieSummaryCard.ratings at 2210: 評分. Current 评级 contains Simplified Chinese 评 in the Traditional Chinese catalog.
- pt_BR components.MusicArtistFilter.artist at 2219: Artista. Caller appends a colon; current period renders Artista.:.
- ja components.MusicCollectionFilters.selection at 2229: 選択 {selected}/{total}. Caller renders selectedCount/totalCount; 選択 is clearer than borrowed セレクション.
- vi components.MusicCollectionFilters.selection at 2229: Đã chọn {selected}/{total}. Caller renders selectedCount/totalCount; Vùng chọn means a selected area, not a selection count.
- pt_BR components.MusicDetails.Layout.artist at 2235: Artista. Caller appends a colon; current period renders Artista.:.
- de components.MusicDetails.Layout.musicBrainzRating at 2244: MusicBrainz-Bewertung: {score} von {votes} Stimmen. Partially untranslated Rating and Abstimmungen are less natural than app terminology Bewertung/Stimmen.
- ja components.MusicDetails.Layout.origin at 2248: 出身地. Caller displays data.artist.area, a geographic origin; 出身地 is more natural than オリジン.
- ja components.MusicDetails.Layout.runtime at 2251: 再生時間. Caller is music album detail; 上映時間 is screening/movie runtime. 再生時間 is music playback duration.
- pt_BR components.MusicDetails.Layout.trackArtist at 2255: Artista da faixa. Caller uses this as album track artist role; faixa is the precise Brazilian music-track term.
- ja components.MusicDetails.Layout.trackCount at 2256: トラック数. Natural count label; トラックカウント is awkward transliteration.
- ko components.MusicDetails.Layout.trackCount at 2256: 트랙 수. Natural count label; 트랙 카운트 is awkward transliteration.
- zh_Hans components.MusicDetails.Layout.trackCount at 2256: 曲目数. Album track count; 曲目数 is natural unlike literal 音轨计数.
- zh_Hant components.MusicDetails.Layout.trackCount at 2256: 曲目數. Album track count; 曲目數 is natural unlike literal 音軌計數.
- ko components.MusicDetails.mp3Pending at 2265: 열려 있는 MP3 요청이 이미 있습니다.. Current Korean says an open MP3 exists and omits source noun request.
- id components.MusicDetails.removefromwatchlist at 2268: Hapus dari daftar tontonan. Remove action leaves Watchlist English while the paired add action uses daftar tontonan.
- ko components.MusicDetails.removefromwatchlist at 2268: 관심 목록에서 제거. Remove action leaves Watchlist English while the paired add action uses 관심 목록.
- pt_BR components.MusicDetails.removefromwatchlist at 2268: Remover da lista para assistir. Remove action leaves Watchlist English while the paired add action uses lista para assistir.
- ja components.MusicDetails.requestdiscography at 2270: ディスコグラフィーをリクエスト. Caller uses a button action; current noun compound does not express the action.
- pt_BR components.MusicDetails.requestdiscography at 2270: Pedir discografia. Button action has an unnecessary terminal period.
- ja components.NotificationTypeSelector.mediaAutoApproved at 2293: 自動承認されたリクエスト. Current Japanese reads as an instruction to approve; source describes an approved request.
- ko components.NotificationTypeSelector.mediaAutoApproved at 2293: 자동 승인된 요청. Current Korean can mean a request for approval; source describes an auto-approved request.
- zh_Hans components.NotificationTypeSelector.mediaAutoApproved at 2293: 自动批准的请求. Current Chinese can mean request for automatic approval; source describes an auto-approved request.
- zh_Hant components.NotificationTypeSelector.mediaAutoApproved at 2293: 自動核准的請求. Current Chinese can mean request for automatic approval; source describes an auto-approved request.

## Four-locale audit reconciliation

The separate Arabic/Hindi/Indonesian/Vietnamese audit covers 400 cells and validates by checksum. Primary and audit comparison:
- candidate_target_differs: 2
- no_op_candidate_ignored: 1
- primary_added_proposal: 18
- same_candidate: 113
- same_current_accept: 266

The two differing proposals are adjudicated in favor of the primary: Arabic Request Discography uses the imperative button action, and Hindi score wording uses के आधार पर for the vote basis. All 18 primary-added proposals beyond that audit's accept-current decisions were reviewed and accepted.

## Limits

- Agent cross-review, not qualified native-speaker approval.
- Browser review was not performed for this window.
- Five source strings have definition-only or single-reference caller evidence; this limits caller coverage but not string/hash/placeholder checks.
- No repository files, tests, builds, CI jobs, releases, or tags were changed or created.
