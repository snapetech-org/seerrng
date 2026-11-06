# SeerrNG PR #418 W3980-W3999 cross-review

This sealed cross-review covers all 240 source/locale cells from candidate-free input pinned to head `d9c5224dbce97e8ae6e72b0ad0bf401e65e215eb`, tree `6578ebc4c8bd6c569fcea47978a2c47bd6e4bc8f`, and base `fa40534ccced75bde1125c14760514fcd5d7de4d`. It binds the candidate-free, primary, and blind packets by exact checksums.

The decision ledger records the independent disposition, rationale, source/current/context hashes, both review dispositions, proposal hashes/text, proposal token audits, and reviewer disagreements. The unresolved position-3987 cells remain hash-only holds.

Run the portable verifier without a repository or network:

```sh
python3 verify-cross-review.py \
  --candidate-free-input /path/to/candidate-free-input \
  --primary-review /path/to/primary-review \
  --blind-review /path/to/blind-review
```

The verifier reads only those three packet directories and this cross-review directory. The work did not include browser review or native-speaker signoff.
