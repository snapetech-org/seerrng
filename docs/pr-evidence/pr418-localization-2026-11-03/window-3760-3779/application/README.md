# SeerrNG W3760–W3779 application evidence

Catalog commit `61bc396b1bb4d79a96b5dedcf294fa44d3eeeb75` applies the 12 root-approved cross-audit targets to seven locale catalogs. It is a direct child of pinned baseline `d317a07ea0e5456b6d4660470c57d1f205cd0587` / tree `c1383dfb6e6fd4e926f9c89d4ec6b7e8ea7d6008`.

The application plan pins each old value and its hash. Readback covers all 240 selected window cells: 228 remain current, 9 are corrections, and 3 are refinements. All 12 selected targets match their exact cross-ledger values. The 13 catalogs retain the same 9,494-key set. Each individual catalog's key order, non-target values, and all prior hash-only holds are preserved; pre-existing order differences from English in `ja`, `ko`, `vi`, `zh-Hans`, and `zh-Hant` remain unchanged. English source data is unchanged.

All selected proposals pass placeholder, markup, numeric, and protected-literal checks. The three Hindi protected-literal mismatches in the current values (`IP`, `API`, `URL`) are corrected. The 3,760 earlier source selections and 12 carried holds are reattested hash-only; prior hold text is not included.

Run `python3 docs/pr-evidence/pr418-localization-2026-11-03/window-3760-3779/application/verify_application.py` from the repository root. It checks the baseline and catalog Git objects, selected preimages/results, every readback cell, per-catalog order and non-target preservation, token/literal outcomes, and hash-only continuity.

Visual acceptance remains unverified. The pinned head has zero deployments, and the persistent Agentic VM reaches only the Seerr setup screen; no setup state was changed for review. Headed-browser review and qualified native-speaker approval remain pending. No product tests, builds, scans, CI dispatches, or workflow edits were performed.
