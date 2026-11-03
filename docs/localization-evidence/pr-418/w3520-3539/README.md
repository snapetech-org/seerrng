# SeerrNG PR #418 localization evidence — W3520–W3539

- Pinned source: `265171657d48ef56ee81cc1c6a5c3d07abe5d07e`; tree `402984893883cf7afd106cd208f6027d7410f2fb`.
- Scope: 20 source IDs × 12 locales = 240 audited cells.
- Applied cross-audit proposals: 30; unchanged current cells: 210; holds: 0.
- `candidate-free-input/`, `primary-review/`, `independent-blind-review/`, and `cross-audit/` are copied evidence packets. Their original checksum-list files and packet contents are preserved.
- The sealed cross-audit retains its original pre-approval `applicationApproved: false` field. The separate `application-authorization.json` records the explicit root authorization to apply its 30 proposed targets. Native-speaker signoff remains false.
- Candidate-free manifest SHA-256: `9e032c395028881ffe5273ae0d7d13668dd26e9cc7cd4b321a68d2cfee95dd63`; candidate-free checksum-list SHA-256: `2c13436eb5d119231ce92a5ca8add130df8714a82a9b5243f22e24262957bb6d`.
- Primary checksum-list SHA-256: `225c152bc63d8140ffb80d59fef7db8bf88053601fd8d3e613e97ffeca2d1471`; blind checksum-list SHA-256: `7efeee5cec4b85e3699aa12f6bdde5cf6d3f982df8b2c16eb0c9fcc934abad00`; cross-audit checksum-list SHA-256: `f2ea5d0f348647b149cd1a17ca187887d475fd86564978162c4e3f06ba1dca3b`.
- Structural verification checks exact targets for all 240 cells, exact locale JSON structure/key order against the pinned base commit, and unchanged non-target catalog values. No tests, builds, scans, CI, or browser review were run for this application.

Release-note fragment for the PR description: Reviewed provider and series-status translations across 12 locales, correcting 30 selector labels and messages.
