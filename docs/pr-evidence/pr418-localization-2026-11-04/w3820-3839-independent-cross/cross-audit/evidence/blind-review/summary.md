# Blind review summary: SeerrNG PR #418, W3820–W3839

## Pin and scope

- Repository / PR: `snapetech-org/SeerrNG` #418.
- Pinned head: `6c489a64782d31fee70a6aeef386c88527b33083`; tree: `9bbf55986a34e9a2bc0c4027205927df65f8754b`; base: `main` at `fa40534ccced75bde1125c14760514fcd5d7de4d`.
- Window positions: `3820–3839`; `20` English source IDs × `12` locales = `240` reviewed cells.
- Candidate-free packet only. Its pre/post attestation and ref snapshots identify the same open draft PR head; its included verifier passes. No repository or PR content was changed.

## Results

- Accepted: **232** cells.
- Held for correction or focused re-review: **8** cells.
- Nonblocking style observations: **9** cells.
- Source placeholders, markup tags, and numeric-token mismatches: **0** each.
- Protected-literal mismatches: **2**, both held (Hindi API and IP are transliterated instead of retaining the exact Latin literals).
- All 240 cells are represented once in the ledger and bound to their source, target, caller-context, catalog file, and pinned head/tree hashes.

## Held cells

| Position | Locale | Source ID | Finding |
|---:|---|---|---|
| 3824 | `hi` | `components.Settings.MylarModal.apiKey` | The source protected literal API is replaced by Devanagari transliteration (एपीआई); the meaning is clear, but the required Latin literal is absent. |
| 3828 | `ar` | `components.Settings.MylarModal.compatibilityNote` | The Arabic term مفاهرس appears misspelled or malformed for “indexers,” making this technical noun uncertain in the compatibility note. |
| 3829 | `ja` | `components.Settings.MylarModal.createmylar` | Mylar is rendered as マイラー in this title although the same locale keeps the product name as Mylar in neighboring Mylar settings strings; this may obscure the product reference. |
| 3829 | `ko` | `components.Settings.MylarModal.createmylar` | The title leaves Server in English (“새 Mylar Server 추가”), while this locale translates the same label term as 서버 in adjacent Mylar strings. |
| 3830 | `vi` | `components.Settings.MylarModal.defaultserver` | “Máy phục vụ” is an unusual and inconsistent rendering of the technical UI term “server”; this locale uses the standard term “máy chủ” in the adjacent Add Server and Edit Server strings. |
| 3833 | `ar` | `components.Settings.MylarModal.enableSearchHelp` | The first mention renders the product name Mylar as مايلر, while later mentions in the same target preserve Mylar in Latin script. Preserve the product name consistently. |
| 3836 | `hi` | `components.Settings.MylarModal.hostname` | The source protected literal IP is replaced by Devanagari transliteration (आईपी); the meaning is clear, but the required Latin literal is absent. |
| 3838 | `vi` | `components.Settings.MylarModal.servername` | “Máy phục vụ” is an unusual and inconsistent rendering of the technical UI term “server”; this locale uses “máy chủ” in the adjacent Add Server and Edit Server strings. |

## Nonblocking observations

These do not change the source meaning, so the cells remain accepted: Spanish register shifts between adjacent validation messages; Chinese punctuation spacing; and terse wording for the “Manage Requests” permission label in Brazilian Portuguese, Vietnamese, and Indonesian. Indonesian “Server Baku” is understandable as a standard/default server but is less idiomatic than common UI wording.

## Integrity and verification

- Candidate-free input SHA-256 manifest: all entries passed before review and after copying from `kspls0` to the local output folder on `kspld0`.
- Included `verify-candidate-free.py`: `PASS`; head/tree, source window, 240 cells, caller coverage, continuity reattestations, token counts, and deployment counts matched packet metadata.
- `verify-blind-review.py`: portable verifier; checks packet and output checksums, exact pins, complete 240-cell coverage, target/source hashes, caller-context hashes, and dispositions.
- Review confidence: **moderate** overall. The review independently compared English strings, recorded call sites, current translations, and token checks; non-English nuance was not certified by a separate native-speaker review.
- Scratch output retained at `task-scratch/seerrng-pr418-w3820-3839-clean-blind-20261104/output/`; no generated artifacts outside this deliverable were created.
