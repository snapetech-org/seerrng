# SeerrNG PR #418 W4000-W4019 current-head candidate-free input

This fresh packet carries only the 20 exact source IDs from the prior sealed W4000-W4019 selected-source list, with current English source text, all 240 current target cells, and caller evidence rechecked at the live PR head. It contains no primary/blind proposal text, translation recommendation, or cross-review decision.

The source IDs and English source hashes match the prior W4000 selection. Their current catalog positions are recorded separately because 37 earlier English IDs were added after the old packet. Current callers, code file blobs, catalog blobs, English values, target values, placeholder/ICU/markup/numeric/protected-literal diagnostics, and source-order hashes are pinned to the exact current head and tree.

Run python3 verify_current_packet.py --repo /path/to/seerrng from this directory to verify packet checksums and exact Git object/value pins. The exact PR worktree used here was clean and at the pinned head.
