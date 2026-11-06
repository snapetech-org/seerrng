# SeerrNG PR #418 W3320–W3339 independent blind review

## Scope and evidence

- Repository / PR: `snapetech-org/seerrng` / #418
- Pinned head: `70caabc2f95df1a7de3f869111aea1df58522d96`
- Pinned tree: `daac9e9284adac648fd3f6147265c21c90cdddba`
- Reviewed source IDs: positions 3320–3339, 20 IDs × 12 direct locales = 240 cells
- Locale order: `es, zh_Hans, hi, de, ja, fr, pt_BR, ar, ko, zh_Hant, vi, id`
- Review evidence: candidate-free input at `/mnt/disks/scratch/task-scratch/seerrng-pr418-w3320-3339-blind-input-20261103/input` only. The input manifest was verified before producing this review.
- Source/current catalog pins: all 13 locale catalogs have 9,494 keys in the input; per-row catalog file SHA-256, Git blob, current target hash, and translation hash are retained in the ledger.

## Decisions

- `keep`: 167 cells
- `revise-proposed`: 13 cells
- `hold-context`: 60 cells

The 60 hold rows cover five keys with no direct message reference at the pinned head: `components.Requests.deleted`, `components.Requests.deleting`, `components.Requests.ebook`, `components.Requests.ebookAndAudiobook`, and `components.Requests.format` (12 locales each). Caller-context resolution is recorded separately and does not substitute for a field-specific caller. The existing target is retained for every held cell; no semantic approval is implied.

### Proposed corrections

| Key | Locale | Proposed target | Reason |
|---|---|---|---|
| `components.Requests.editTooltip` | `hi` | इस लंबित अनुरोध को संपादित करें। | Adds the omitted “pending” qualifier from the source tooltip. |
| `components.Requests.emptyTitle` | `pt_BR` | Nenhum pedido encontrado | Removes the terminal period from a short empty-state heading; the source and parallel locale headings are unpunctuated. |
| `components.Requests.emptyTitle` | `zh_Hant` | 找不到任何請求 | The current 要求 can read as “requirements”; 請求 states that no media requests were found. |
| `components.Requests.eta` | `es` | Hora estimada de finalización: {date} | The caller supplies estimatedCompletionTime; “llegada” means arrival and misstates completion. |
| `components.Requests.eta` | `de` | Voraussichtliche Fertigstellung: {date} | The caller supplies estimatedCompletionTime; “Ankunftszeit” means arrival and misstates completion. |
| `components.Requests.eta` | `ja` | 完了予定時刻：{date} | The caller supplies estimatedCompletionTime; 到着予定時刻 means arrival time and misstates completion. |
| `components.Requests.eta` | `fr` | Fin estimée : {date} | The caller supplies estimatedCompletionTime; replacing the ambiguous English ETA with estimated completion clarifies the value. |
| `components.Requests.eta` | `pt_BR` | Previsão de conclusão: {date} | The caller supplies estimatedCompletionTime; “chegada” means arrival and misstates completion. |
| `components.Requests.eta` | `ar` | وقت الانتهاء المتوقع: {date} | The caller supplies estimatedCompletionTime; الوصول means arrival and misstates completion. |
| `components.Requests.eta` | `vi` | Thời gian hoàn thành dự kiến: {date} | The caller supplies estimatedCompletionTime; translating the completion meaning is clearer than retaining ETA. |
| `components.Requests.eta` | `id` | Perkiraan waktu selesai: {date} | The caller supplies estimatedCompletionTime; translating the completion meaning is clearer than retaining ETA. |
| `components.Requests.firstPublished` | `ja` | 初版発行日 | The caller selects this label for book requests and displays a date; 初公開 suggests a premiere/release rather than a book’s first publication. |
| `components.Requests.firstPublished` | `id` | Pertama kali diterbitkan | Adds kali for the natural Indonesian phrase “first published”; the caller uses the label for a book publication date. |

## Integrity and language checks

- All 240 source SHA-256 values and current-target SHA-256 values matched the exact UTF-8 strings in the input.
- All proposed targets have an exact SHA-256 in the ledger; unchanged and held targets hash identically to current targets.
- Placeholder parity is exact in every cell, including `{name}` and `{date}`. Proposed markup review found no HTML/JSX/Markdown tags; all strings are plain text, with interpolation placeholders listed separately.
- No source/current protected-literal occurrences were listed by the input manifest. The review additionally treats the technical token `4K` as protected and confirms it remains unchanged in all 12 locales. Numeric tokens are recorded separately; the only numeric token in the window is `4K`.
- Arabic rows include per-cell RTL notes. Mixed-direction placeholders and `4K`, plus the `+` separator in the held book/audiobook label, are called out for visual bidi ordering checks.
- Input checksum manifest entries verified: `README.txt`, `caller-contexts.jsonl`, `review-input.jsonl`, `source-boundaries.json`, `window.json`.

## Limits

This is a conservative machine review based on the supplied source strings, current targets, and pinned caller snippets. It is not qualified native-speaker approval. Confidence is moderate for language judgments and high for the caller-gate holds; locale-native review remains appropriate before applying proposed edits.
