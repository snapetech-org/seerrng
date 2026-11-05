# SeerrNG PR #418 W3980-W3999 blind semantic review

This artifact contains one disposition for each of the 240 candidate-free source/locale cells. It binds the review to head d9c5224dbce97e8ae6e72b0ad0bf401e65e215eb, tree 6578ebc4c8bd6c569fcea47978a2c47bd6e4bc8f, and the exact candidate-free input checksums recorded in review.json.

Run the portable verifier with:

    python3 verify-blind-review.py --candidate-free-input /path/to/candidate-free-input

The verifier checks the candidate-free input checksum inventory, exact input pins, all 240 source/current-target hash bindings, dispositions, proposed-target hashes, and token preservation for proposals. It does not inspect a repository or contact external services.

This review is blind to current PR proposals and earlier review decisions. It does not claim native-speaker signoff or browser review.
