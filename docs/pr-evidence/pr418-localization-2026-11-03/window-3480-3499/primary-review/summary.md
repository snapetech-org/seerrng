# Primary semantic review — W3480–W3499

## Result

Reviewed all 240 locale cells across 20 source IDs and 12 locales at PR #418 head `e2de7357bad7c385bf710da0edee93927f494767` / tree `ca93443397e10cea0ed70cec67fcb2905955cbf2`. Dispositions: **234 accept-current, 3 corrections, 3 refinements, 0 holds**.

The ledger preserves each message namespace. All 240 current targets pass the packet’s placeholder token sequence and set checks; all final targets preserve the source token sequence and set (no placeholders occur in this window).

## Selected target changes

| Position | Locale | Disposition | Current target | Selected target | Selected SHA-256 |
|---:|---|---|---|---|---|
| 3480 | pt_BR | refinement | Veja todos os resultados do software. | Veja todos os resultados do software | `aa2742c3fe7b5d433b44473522890c5caa9eaf55de51a24c80e5198da33ed0e9` |
| 3480 | ko | correction | 모든 소프트웨어 결과보기 | 모든 소프트웨어 결과 보기 | `d3a21b20cc817142e39ad28a64d1953016a286a209d8e264321ee3a2a914e621` |
| 3481 | pt_BR | refinement | Programas | Software | `9b3289a385a5301eea0c04a06fde98bc542113ab4ed24c47c9b9771984869a31` |
| 3484 | zh_Hant | correction | 升冪 | 升序 | `ca715c0d8d839613407463373c2428ff611b37b175de2cef2888f4741e6a5ed7` |
| 3495 | zh_Hant | correction | 过滤器 | 篩選器 | `47d3fc2a10d683b0a45c0f40039f9e48f71ee7b3b500f94a0de513daa89d0186` |
| 3497 | id | refinement | Penyaring Media | Filter Media | `2a900531bd444bb453e01c5d6bab481c1edc0848072e3585e3eae7a6c2e6709b` |

Rationales and current/selected target hashes are recorded per cell in `primary-ledger.jsonl`.

## Caller context

There are **no caller holds**. The candidate-free packet provides direct references for all 20/20 source IDs: 23 references across `components.Search` (18 IDs) and `components.Search.SoftwarePreview` (2 IDs). The scoped caller-resolution findings list is empty. Each cell ledger row retains its exact same-namespace reference paths, lines, and line hashes. No same-named keys from another namespace were used.

## Dispositions by locale

| Locale | Accept-current | Corrections | Refinements | Holds |
|---|---:|---:|---:|---:|
| es | 20 | 0 | 0 | 0 |
| zh_Hans | 20 | 0 | 0 | 0 |
| hi | 20 | 0 | 0 | 0 |
| de | 20 | 0 | 0 | 0 |
| ja | 20 | 0 | 0 | 0 |
| fr | 20 | 0 | 0 | 0 |
| pt_BR | 18 | 0 | 2 | 0 |
| ar | 20 | 0 | 0 | 0 |
| ko | 19 | 1 | 0 | 0 |
| zh_Hant | 18 | 2 | 0 | 0 |
| vi | 20 | 0 | 0 | 0 |
| id | 19 | 0 | 1 | 0 |

## Scope and confidence

This is a machine-assisted primary semantic review of the candidate-free packet only. No independent blind review or proposal artifact was inspected. Cell confidence reflects the reviewer’s confidence in the specific semantic judgment; it does not establish qualified native-speaker approval.
