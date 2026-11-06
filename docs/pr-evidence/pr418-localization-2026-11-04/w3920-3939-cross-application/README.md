# SeerrNG PR #418 W3920–W3939 cross-audit application

This packet records the application of the 17 selected cross-audit proposals from exact input head `c989e745a64743a45282a7a2704713945d8406d8` / tree `b25ffd26701a43957924a992f4368f5b7a6a8f29`. Product commit: `df93035a71c4b08470b34ed00abadd443bbdd876`.

The review covers 20 source IDs × 12 locales (240 cells). Cross reconciliation keeps 219 current targets, selects six corrections and 11 refinements, and retains four hash-only contextual holds. Two blind holds resolved through selected proposals are recorded hash-only in the cross-audit packet. The 22 historical hold hashes and 197 historical applied-target hashes are preserved byte-for-byte.

`application-readback.jsonl` records all 240 outcomes. It includes exact current and final text for non-held cells; held cells contain only identifiers and SHA-256 digests. No held source, current target, proposed target, or rationale text is included. `catalog-preimages.json` and `catalog-postimages.json` record hashes, blobs, key counts, and key-order hashes for all 13 pinned locale catalogs.

Run `python3 verify_application.py` from this directory in the repository after the evidence commit. The verifier uses Git objects and the committed catalogs; it does not run tests, builds, scans, or CI. Checksums are in `SHA256SUMS.txt`.

This is a machine-assisted review. Native-speaker approval and browser acceptance are not claimed. No workflow changes, merge, release, or tag are included.
