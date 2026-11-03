# Independent read-only audit: SeerrNG PR #418 W3320–W3339

**Assessment: safe to apply the 17 ratified value changes** against the pinned head, with all 60 caller-gated cells retained unchanged. Confidence: high for hashes, catalog structure, and decision reproduction; moderate for independent-review process provenance.

- Live PR head/tree: `70caabc2f95df1a7de3f869111aea1df58522d96` / `daac9e9284adac648fd3f6147265c21c90cdddba`; PR state: `open`, draft: `True`.
- All five input/review/rationalization checksum manifests verify. Corrected clean input and the separate blind input are byte-identical across all six files. The primary, blind, and ratified ledgers join one-to-one over 240 cells, and all per-cell source/current/catalog/caller pins and target SHA-256 values recompute.
- The apply plan contains exactly 17 changed, existing locale values; each planned target and hash equals the ratified ledger. No held cell is in the plan. The 60 holds remain current across the five zero-direct-caller keys.
- Exact live catalog blobs, file hashes, 9,494-key counts, ordered-key hashes, and all 51 caller-context snippets match the packet. The 13 live catalog key sets are equal. Five catalogs have a pre-existing different full ordered-key hash, while the 20-key window remains contiguous and in the same relative order; the plan is key-addressed and changes no key or order.
- **Blind-boundary caveat:** the candidate-free input contains no proposed targets or review verdict/rationale fields, but it prelabels the 60 rows with `eligibility=hold-context` and exposes their caller-gate metadata. Therefore blind agreement is not independent evidence for those holds; the exact live caller pins support retaining them. The filesystem artifacts do not attest reviewer access isolation from the primary ledger, which predates the blind ledger file. This limits process-level independence claims but does not affect the reproducibility of the 17 candidate-free proposals or application integrity.
- Native-speaker approval remains outstanding. No repository, PR, or GitHub state was changed; no tests/builds/scans/CI were run.

See `audit.json` for the 17 exact source/target hashes, per-catalog/caller pins, disposition counts, and observed artifact chronology. Re-run with `python3 audit.py` from any machine with `gh` access to the repository.
