# SeerrNG W3440–W3459 post-seal primary comparison

Comparison occurred after the independent blind ledger was sealed. It found 15 cells where dispositions differ or independently selected candidate text differs. The complete cell-level rows are in `primary-comparison.jsonl`.

## Cases
- 3440 vi — `components.Requests.sortTitle`: blind **accept-current**; primary **refinement** → `Tiêu đề`
- 3447 zh_Hant — `components.Requests.taskFilters`: blind **accept-current**; primary **correction** → `任務篩選器`
- 3448 vi — `components.Requests.timeFrame`: blind **accept-current**; primary **refinement** → `Khoảng thời gian`
- 3449 zh_Hant — `components.Requests.title`: blind **accept-current**; primary **refinement** → `請求`
- 3450 hi — `components.Requests.trackCount`: blind **refinement** → `ट्रैक की संख्या`; primary **refinement** → `ट्रैकों की संख्या`
- 3450 pt_BR — `components.Requests.trackCount`: blind **accept-current**; primary **refinement** → `Número de faixas`
- 3451 es — `components.Requests.unavailable`: blind **refinement** → `No disponible`; primary **accept-current**
- 3453 es — `components.Requests.userFilter`: blind **correction** → `Seleccionar usuario`; primary **accept-current**
- 3455 ar — `components.Requests.viewAllHistoryTooltip`: blind **refinement** → `أزل عامل تصفية الفترة الزمنية لتضمين الطلبات الأقدم. وتبقى بقية عوامل التصفية كما هي.`; primary **accept-current**
- 3455 de — `components.Requests.viewAllHistoryTooltip`: blind **correction** → `Entfernen Sie den Zeitraumfilter, um ältere Anfragen einzuschließen. Alle anderen Filter bleiben unverändert.`; primary **correction** → `Entfernen Sie den Zeitperiodenfilter, um ältere Anfragen einzuschließen. Andere Filter bleiben unverändert.`
- 3455 ko — `components.Requests.viewAllHistoryTooltip`: blind **correction** → `기간 필터를 제거하면 더 오래된 요청도 포함됩니다. 다른 필터는 그대로 유지됩니다.`; primary **accept-current**
- 3455 pt_BR — `components.Requests.viewAllHistoryTooltip`: blind **refinement** → `Remova o filtro de período para incluir solicitações mais antigas. Os demais filtros permanecem inalterados.`; primary **refinement** → `Remova o filtro de período para incluir solicitações mais antigas. Os outros filtros permanecem inalterados.`
- 3456 zh_Hans — `components.Requests.watchAheadAssigned`: blind **refinement** → `管理员设置的剧集队列 · {count, plural, other {# 集}}`; primary **accept-current**
- 3457 ja — `components.Requests.watchAheadEpisodeBadge`: blind **refinement** → `自動でキューに追加済み`; primary **accept-current**
- 3459 de — `components.Requests.writer`: blind **refinement** → `Autor`; primary **accept-current**

These are points for cross-audit, not adjudicated outcomes. Each review is machine-assisted; none establishes native-speaker approval.
