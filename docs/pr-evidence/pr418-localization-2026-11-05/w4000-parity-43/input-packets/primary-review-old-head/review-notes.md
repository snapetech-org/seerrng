# Review notes

## Semantic decisions

- All 43 insertion-gap IDs are user-facing and have pinned live callers. Every target cell is `propose-insert`; none is excluded or held.
- The single changed source ID, `components.RequestModal.watchAheadActiveForRequest`, is separate from insertion gaps. Its current English value is “This request keeps {count} queued ahead.” Each current target string still communicates the old administrator default, so all 12 are `propose-refresh`.
- “Movies Ahead” and “buffer” refer to keeping one or two unwatched collection movies ahead in the queue. They do not refer to storage or network buffering.
- Queue status and reason strings are dynamically selected from typed status/reason values. Their translations therefore remain short and clearly describe a state or blocking condition.
- Stopping a queue prevents future requests; it does not cancel existing requests or remove downloaded files. Restarting is for requesting missing movies after an earlier request was lost or interrupted.
- The Episode Queue control is a per-request look-ahead setting. `Off`, account default, and request override labels remain distinct. The help and save messages retain the effects on future queueing and the state of existing requests/files.
- The playback-analysis tip preserves the maximum of two seasons per minute and one queueing per season per 30 days. The Trakt callback route is copied exactly.

## Locale terminology

| Locale | Episode Queue | Collection Queue | Queue/playback term |
|---|---|---|---|
| es | cola de episodios | cola de la colección | cola / reproducción |
| zh-Hans | 剧集队列 | 合集队列 | 队列 / 播放 |
| hi | एपिसोड कतार | संग्रह कतार | कतार / प्लेबैक |
| de | Episodenwarteschlange | Sammlungswarteschlange | Warteschlange / Wiedergabe |
| ja | エピソードキュー | コレクションキュー | キュー / 再生 |
| fr | file d’attente des épisodes | file d’attente de la collection | file / lecture |
| pt-BR | fila de episódios | fila da coleção | fila / reprodução |
| ar | قائمة انتظار الحلقات | قائمة انتظار المجموعة | قائمة الانتظار / التشغيل |
| ko | 에피소드 큐 | 컬렉션 큐 | 큐 / 재생 |
| zh-Hant | 集數佇列 | 合集佇列 | 佇列 / 播放 |
| vi | hàng đợi tập | hàng đợi bộ sưu tập | hàng đợi / phát |
| id | antrean episode | antrean koleksi | antrean / pemutaran |

## Mechanical review

Every proposal was compared with its exact pinned source text. Placeholders, ICU argument/type/selectors/`#`, markup tags, inline-code spans, numeric tokens, and protected literals must match. Locale-specific spelled-out quantities are localized words; literal source digits such as `1`, `2`, and `30` remain digits. The Arabic ICU text uses “number of episodes: #” for both source selectors to avoid mismatched Arabic noun forms while preserving the required ICU shape.

## Disposition and confidence

- `propose-insert`: 516 cells; semantic disposition `accept`; confidence `moderate`.
- `propose-refresh`: 12 cells; semantic disposition `accept`; confidence `moderate`.
- Holds: 0.

Moderate confidence reflects a complete primary semantic and technical review without native-speaker confirmation. The review does not claim that an additional native-language editorial pass occurred.
