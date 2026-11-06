# SeerrNG PR #418 W3840-W3859 independent cross-audit

This bundle cross-adjudicates all 240 current translation cells (20 sources × 12 locales) for W3840–W3859. It is pinned to PR head ba5bb93cdb4f107a8337aae228b7cd397e1140a6 and tree 5420ae8fa33bda3619650757a2930a0114dbe4d1. The live PR was OPEN/DRAFT/CLEAN when the bundle was sealed.

The candidate-free, primary, outer packet, and sealed blind verifiers all passed before review. The proposal union contains 46 cells: 44 primary proposals and 23 blind proposals, with 21 overlap cells (6 exact target agreements and 15 different targets). The cross ledger resolves all 240 cells: 194 accept-current, 24 corrections, 22 refinements, and no holds.

The three baseline protected-literal issues (IP in Hindi at position 3850; ID in French and Arabic at position 3856) are resolved by the selected targets. All selected targets preserve placeholders, markup, numeric tokens, and protected literals. The primary targets for Arabic, French, and Brazilian Portuguese at 3856 were incomplete fragments; the cross ledger rejects those partial replacements and supplies complete paragraph translations.

Inputs are included under inputs/portable-packet/ and inputs/blind-review-output/. Run python3 verify_cross_audit.py from this directory to re-run all input verifiers and validate pins, complete coverage, proposal adjudication, token parity, and checksums. No repository or PR files were edited. No tests/builds/scans/CI or browser/native-speaker review were performed or claimed.
