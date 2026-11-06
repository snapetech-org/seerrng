# SeerrNG PR #418 W3440–W3459 third-party cross-audit

## Result

Reviewed **240 locale cells** across 20 source IDs and 12 locales. I reconciled all **15 primary/blind disposition divergences** against the candidate-free source strings, current targets, and exact pinned caller evidence. Final decisions: **210 accept-current, 5 correction, 13 refinement, 12 hold**. All 12 `components.Requests.statusUpdated` cells remain held because caller resolution is absent from the pinned Requests component.

The audit recommends 18 changed targets (5 corrections, 13 refinements). Exact complete targets, candidate origin, SHA-256, source/current/catalog/caller pins, both source reviews, rationales, and structural checks are recorded per cell in `cross-audit-ledger.jsonl`.

## Integrity and pins

- Repository/window: `snapetech-org/seerrng`, PR #418, W3440–W3459.
- Head/tree: `049b23526911e6cf6b1a0b2c397d155eb51d5ddf` / `0a83d4f6bcea1367f218efb3898b15d2b0f4f140`.
- Candidate-free manifest: `c51bba771da7be6d11f7372190be491ac09531dc98fcde2381e6ae66a7315db4`; every candidate-free SHA256SUMS entry verified.
- Every primary output SHA256SUMS entry verified; primary rows pin the same candidate-free manifest.
- Blind seal validates 240 rows and ledger SHA-256 `29ef8365dc49849712d413121e12105934c11e20b64c8457c0a15bedfde1a0c2` and records that the primary ledger was not consulted before sealing.
- Sealed comparison SHA-256 `764ea13d40b9ab0a3b22fa7b66f6b41e5bf751472782080c5124db6ce0e69c38`; its summary records 240 compared cells and 15 disagreements.
- Source, current-target, locale, catalog path/hash/blob, caller file, PR, head/tree and window pins matched across the supplied packet and ledgers for all 240 cells. Source and current-target hashes recomputed successfully.
- Structural checks passed for every selected non-hold target: ICU argument sequence and set, brace balance, markup sequence, static numeric literals, and count argument preservation. The Chinese `watchAheadAssigned` candidate retains `{count}` and `#`.

## Reconciled disagreements

The full selected target is shown for every divergent cell. Its target hash is computed over the exact UTF-8 string. “Primary proposal” and “blind proposal” indicate which sealed candidate was selected.

| Position | Source ID / locale | Primary / blind | Final complete target | Final | Selected candidate | Target SHA-256 |
|---:|---|---|---|---|---|---|
| 3440 | `components.Requests.sortTitle` / `vi` | refinement / accept-current | `Tiêu đề` | refinement | `primary-proposal` | `df5a00098bccde7309441a15a58bc07199f6d918d5caa918da78b25e86b0c276` |
| 3447 | `components.Requests.taskFilters` / `zh_Hant` | correction / accept-current | `任務篩選器` | correction | `primary-proposal` | `87029d81dbcfae3e9c000f1a8df693c2e37c880c8abbd6ef1c2439d578faa2ff` |
| 3448 | `components.Requests.timeFrame` / `vi` | refinement / accept-current | `Khoảng thời gian` | refinement | `primary-proposal` | `337f7d4331bf72b7a33e525ae43acfa092d411260f5e9f87fa1a22c670867124` |
| 3449 | `components.Requests.title` / `zh_Hant` | refinement / accept-current | `請求` | refinement | `primary-proposal` | `779fdc9670acbc71b451b27ff926c9d034cb9b24a0ba838d84023c9da42fc26a` |
| 3450 | `components.Requests.trackCount` / `hi` | refinement / refinement | `ट्रैक की संख्या` | refinement | `blind-proposal` | `462c44fa6059f85c0f0c7b07edb5e89883bcd7452f593cb96d3e09e3207d02c8` |
| 3450 | `components.Requests.trackCount` / `pt_BR` | refinement / accept-current | `Número de faixas` | refinement | `primary-proposal` | `fc51ffeb8e7f06dbf394cb285c35bcdcfa20f645a2c8fc105137d68f5b2a63ec` |
| 3451 | `components.Requests.unavailable` / `es` | accept-current / refinement | `No disponible` | refinement | `blind-proposal` | `b781f6bd9b98e43d557bc80c4c6838cc1130b1db4f687d2e39f4396f482a642b` |
| 3453 | `components.Requests.userFilter` / `es` | accept-current / correction | `Seleccionar usuario` | refinement | `blind-proposal` | `0833e09152847ee214be7cb74354624e57437817dba28d33bb9b23d6c53ccfa6` |
| 3455 | `components.Requests.viewAllHistoryTooltip` / `de` | correction / correction | `Entfernen Sie den Zeitraumfilter, um ältere Anfragen einzuschließen. Alle anderen Filter bleiben unverändert.` | correction | `blind-proposal` | `f4e4500cfd1489ac92539e867d76f7b16612f56b55e5dbf8f0f7e18d43f2c792` |
| 3455 | `components.Requests.viewAllHistoryTooltip` / `pt_BR` | refinement / refinement | `Remova o filtro de período para incluir solicitações mais antigas. Os demais filtros permanecem inalterados.` | refinement | `blind-proposal` | `41e980aa8eb9c05dc5cfbd32611e1758c621ee03918e784f9d8cf567b500c5bf` |
| 3455 | `components.Requests.viewAllHistoryTooltip` / `ar` | accept-current / refinement | `أزل عامل تصفية الفترة الزمنية لتضمين الطلبات الأقدم. وتبقى بقية عوامل التصفية كما هي.` | refinement | `blind-proposal` | `ce843f6c50063be7a6d513a5a525252df1dd7e458e82b901611290f4af2b79ed` |
| 3455 | `components.Requests.viewAllHistoryTooltip` / `ko` | accept-current / correction | `기간 필터를 제거하면 더 오래된 요청도 포함됩니다. 다른 필터는 그대로 유지됩니다.` | refinement | `blind-proposal` | `61b65ca9a554b09e13afd76e63e378e8cbca70c5c5a3d8e8cf144148c1fd5f2f` |
| 3456 | `components.Requests.watchAheadAssigned` / `zh_Hans` | accept-current / refinement | `管理员设置的剧集队列 · {count, plural, other {# 集}}` | refinement | `blind-proposal` | `474b2607904f795ec717bc8e27d707ad4c39c9b5a40fb432bacc914d68d3eaa9` |
| 3457 | `components.Requests.watchAheadEpisodeBadge` / `ja` | accept-current / refinement | `自動でキューに追加済み` | refinement | `blind-proposal` | `dd5e748c09551e0340b5aed1f8de0efa1c468c4b5cd401264fc9cb67f68faa7f` |
| 3459 | `components.Requests.writer` / `de` | accept-current / refinement | `Autor` | refinement | `blind-proposal` | `07280b6aeabd2af75d8ede9bbc1c7872d38461edb51d28f982bae568a41626d4` |

Caller evidence independently inspected for these source IDs:

- `components.Requests.sortTitle`: Line 380 maps `title` to `sortTitle`; line 2894 renders mapped labels in task-filter buttons, while lines 3003–3007 render sort controls.
- `components.Requests.taskFilters`: Line 2877 passes `taskFilters` as the localized task-filter section label.
- `components.Requests.timeFrame`: Line 2943 passes `timeFrame` as a CompactSelect label controlled by the selected time-frame value.
- `components.Requests.title`: Lines 2636, 2648, 2657 and 2835 render this as the Requests page heading and document title.
- `components.Requests.trackCount`: Line 1076 labels `music.tracks.length`, which line 1077 formats as the numeric track count.
- `components.Requests.unavailable`: The typed stage map assigns `unavailable` at line 492; `getStageLabel` formats the mapped message at line 1196.
- `components.Requests.userFilter`: Line 2900 uses `userFilter` as the administrator CompactSelect label.
- `components.Requests.viewAllHistoryTooltip`: Lines 3028–3036 use this as the tooltip on View All History; clicking that button sets the time frame to all.
- `components.Requests.watchAheadAssigned`: Lines 1515–1517 render a status badge and pass `watchAheadEpisodeCount` as `{count}`.
- `components.Requests.watchAheadEpisodeBadge`: Lines 1520–1526 render this as a success badge inside the watch-ahead tooltip.
- `components.Requests.writer`: Line 968 uses this as a media metadata label in the mixed-media Requests component.

## Caller-unresolved holds

All 12 locales for `components.Requests.statusUpdated` remain **hold** and have no selected target. The supplied finding pins `src/components/Requests/index.tsx` at SHA-256 `25b612dcda274fe2ea64b76f169587e153b04a675c9b8cd817814d9fbfde5360` and reports no direct message reference, dynamic label mapping, typed stage mapping, or dynamic renderer reference. The finding is scoped to that pinned component snapshot and does not establish a caller context.

## Files

- `cross-audit-ledger.jsonl` — 240 cell records; SHA-256 `02070c96af43dd2edba0f200554b4ab0a2f780e4fb51a6d3f8c74877ff35f1f9`.
- `summary.json` — counts and integrity pins.
- `report.md` — this report.
- `README.md` — artifact guide.
- `SHA256SUMS.txt` — checksums for the four files above.

Where the blind ledger did not record a candidate hash, this audit computed it from the exact sealed proposal text.
