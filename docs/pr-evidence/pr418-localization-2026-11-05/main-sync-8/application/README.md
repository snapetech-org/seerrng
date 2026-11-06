# SeerrNG main-sync translations: application and readback

Product commit: `b13b5e31700af46773c55cdb36da1b9e02bd7e7c`; tree: `caef55a4808e175da23771da2d2128436fa40f46`. It inserts 96 reviewed values across the 12 direct-locale client catalogs.

The script verifies source IDs and English source hashes against the exact input head, inserts only missing keys in source order, preserves the relative order and values of existing keys, checks key-set parity with English, and reads back all 96 exact target hashes. Re-run from a checkout containing the product commit and this evidence with `PYTHONDONTWRITEBYTECODE=1 python3 -B apply_and_readback.py --verify-after`. It is an offline catalog verifier; it does not run app tests or builds.
