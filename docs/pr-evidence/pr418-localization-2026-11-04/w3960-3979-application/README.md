# SeerrNG PR #418 W3960–W3979 application evidence

This packet records the exact-head review, application, and readback for source positions 3960–3979 across the 12 direct locales. English source and fallback remain unchanged.

Input head: a456dd66aad34cb23f432cb3c189bb8083bbbe96
Input tree: 7a5447e5f08e84c392899a6e1400d1df73b1143b
Product commit: cb812bd21cf99964a4a7335830294ebdbdc6df34

The packet contains the candidate-free source and caller inputs, primary review, fresh blind review, independent cross-review, and application readback. Cross-review selected 10 catalog updates (8 corrections and 2 refinements), retained 218 current values, and held 12 Enable Agent cells hash-only at position 3979. Their production caller is the Web Push enabled checkbox; the product meaning of Agent remains undefined in the pinned UI/source context.

All 240 cells were read back. The six changed catalogs retain their key order and all unselected values. Four Arabic ID omissions are corrected; the three Japanese digit 1 values remain accepted equivalents for “one.” The PR remains a draft. Qualified native-speaker approval and exact-head headed-browser acceptance are not claimed.

Verify the outer packet checksums from this directory with:
    sha256sum -c SHA256SUMS.txt

Run the application verifier with a clean checkout at the input head and a checkout containing the product/evidence commits:
    python3 verify_application.py --repo /path/to/seerrng-checkout --product-commit cb812bd21cf99964a4a7335830294ebdbdc6df34

Each reviewer directory includes its own README, manifest, checksum file, and packet verifier. No tests, builds, scans, CI dispatches, workflow changes, merge, release, or tag were made.
