# SeerrNG PR #418 localization review: W3200–W3219

This packet covers 20 pinned source IDs and 240 cells across 12 direct locale catalogs at input head `2be00354833160f0681d5cd779a1b1be37a63a4b`, tree `af588a1ee34f768ae37a29dccd5a508595b7199d`. The primary and independent blind packets are checksum-pinned under `primary/` and `independent-crossreview/`.

The primary screen proposed 63 changes (49 corrections, 14 refinements). The independent blind screen proposed 67 (46 corrections, 21 refinements). Root compared all 240 exact ID/locale/source/current cells, resolved all 27 competing target pairs, accepted every one-sided or matching proposal after caller-context review, and retained all agreed current values. This produced 56 corrections and 20 refinements across 76 cells; no IDs were held.

All 12 direct catalogs retain the same ordered 9,494-key set. Source English, placeholders, and source IDs are unchanged. The long removal description keeps the SeerrNG/ROMarrNG ownership boundary and generic software title. Translation status remains draft; machine-assisted review does not establish native-speaker approval. No tests, builds, scans, CI dispatches, workflow edits, releases, merges, or tags were performed.

## Application review and supporting fixes

A local preview was opened in a new Incognito window on the dedicated Agent VM. The regular saved browser profile and its existing tabs were left untouched. The route was `/requests?mediaType=game`; the local preview account's display language was set to Spanish. The visible viewport was 1920×1024. The translated software-request heading and empty state fit without clipping or overflow. The isolated database contained no requests and had no configured provider, so no populated request rows or row actions were available for visual review.

Screenshot: `browser-review-software-requests-es-1920x1080.png` (PNG dimensions 1920×1024; SHA-256 `ce9a82d5e9bc5ff2883f17c946abaf10e1`). This is a local worktree preview, not a deployed exact-head review.

Rendering first exposed two existing request-path defects, which were corrected in this candidate:

- Renamed `src/components/RequestStatus/messages.ts` to `.tsx`; it contains JSX and the extensionless import resolves with the project's `bundler` module resolution.
- Added the `category` query parameter (`retro`, `modern`, `game`) to `/request/software/status` in `seerr-api.yml`, matching the handler's validation and filtering behavior.

A separate read-only review confirmed both fixes match the callers and runtime contract. No tests, builds, scans, CI dispatches, workflow edits, releases, merges, or tags were performed.
