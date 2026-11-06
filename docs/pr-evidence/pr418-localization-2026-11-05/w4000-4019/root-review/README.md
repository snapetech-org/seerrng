# Root adjudication

This is the final 240-cell ledger after independent primary, blind, and cross review. The reviewer retained 178 exact current values, changed 50 cells to cross-reviewed proposals, and resolved 12 hash-only holds for the notification agent label from exact caller context plus the localized notification-agent settings description. The 12 root overrides are identified by `context-resolved-agent` and include text-free reviewer rationale.

`root-adjudication.jsonl` records every cell, exact source and target hashes, primary and blind dispositions, cross recommendation, root disposition, and selected text. `root-application-manifest.json` pins the entry head/tree, preimage and result hashes for each locale catalog, all 62 changed cells, and the product commit.

For a reproducible local replay, use a clean SeerrNG checkout at the input head `77d30ae742aad7245e6e419237fca6a544531e1f` and run:

    python3 build_root_adjudication.py
    python3 apply_root_adjudication.py --repo /path/to/seerrng
    python3 verify_root_readback.py --repo /path/to/seerrng

The verifier checks all 240 cells, only the 12 locale catalogs, preserved non-target values, and existing relative key order. The applied product change is commit `e27337742b8e0f7926d18bbb766df3e6ce909527`.
