# Independent blind proposal ledger: SeerrNG PR #418 main sync

Pinned input: head `ca2309e960733a7486c55b9a761d82771be97cde`, tree `8c5df06aaf1d703ff923bf1fdf8a21c901b9d26d`.

This packet contains one translation proposal for each of the 8 source IDs × 12 direct locales (96 cells). The exact candidate-free input reported all target cells absent. I used only that candidate-free packet and its pinned source/caller contexts; no primary proposal was opened. No repository files were changed.

The ledger records the source and caller hashes, proposal, rationale, confidence, uncertainty notes, and protected-literal audit per cell. `Trust Reverse Proxy` is a UI setting label and is translated by meaning; `SeerrNG`, `X-Forwarded-For`, `IPv4`, `IPv6`, `CIDR`, the numeric limits/examples, `Jellyfin`, and `Quick Connect` are checked as exact literals where present. The confidence is moderate because the semantic mapping was checked, but locale idiom/product terminology has not received native-speaker approval.

Files: `blind-ledger.jsonl` (96 cells), `token-audit.json`, `manifest.json`, and `verify.py`. Run `python verify.py` from this directory to recheck the input pins, cell coverage, ledger provenance, token audit, and checksums.
