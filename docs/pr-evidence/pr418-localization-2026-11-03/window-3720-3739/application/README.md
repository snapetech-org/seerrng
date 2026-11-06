# Application evidence

This packet contains the exact selected-hash plan, 240-cell readback, 12 locale catalog invariants, 12 hash-only carried-hold readbacks, prior-selection exclusion summary, preflight pins, and commit record. The English source catalog pin is recorded separately and remains unchanged.

Run python3 application/verify_application.py from the repository root. It verifies the parent and catalog commit Git objects, all 240 target preimages and readbacks, exact selected values, locale key order, unchanged English source catalog, carried hold hashes, and prior selection exclusion checks.
