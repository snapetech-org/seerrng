# Responsive native request dialogs

Issues #615 and #616 were found while visually reviewing the exact-head CI
captures for the unreleased v3.72.25 candidate. Both remain open pending delivery.
The comparison baseline is compiled main `60f5f4a5f`; Lumen's original frontend,
colours and native package dimensions are unchanged by this repair.

## Owners and causes

The Orig request-summary reset covered the older `card-table` role but omitted
`media-detail-rows`. Nested author/artist/creator metadata could occupy one cell
and move Genres away from its value. At desktop widths, inherited subgrid and
explicit row placement also displaced fields or placed status before metadata.
A two-selector trial fixed paired rows but its visual comparison exposed that
remaining reading-order problem, which the final shared check now covers.

Persius keeps its existing 640px dialog even on a wide desktop. Shared metadata
selected desktop columns by viewport width, exceeding that dialog's available
space. At 320px, album-track columns could leave no width for the track title.
The first intrinsic-column trial still let the full truncated title contribute
to minimum sizing; measured overflow was 21px. Subsequent isolated CSS trials
are retained separately from compiled-production acceptance.

The request components also carried viewport-based `card:col-*` and `card:row-*`
placement, which recreated five implicit columns inside a two-column dialog.
Those competing placement classes are removed from the three repaired summaries;
both metadata roles now share the existing paired-column owner. Wide Genres keeps
its existing two-line treatment; narrow values wrap without that clamp. Default
palette divider pseudo-elements follow the same stacked orientation as their
containers, including on a desktop with a narrow dialog.

The existing `request-modal-site-surface` now establishes a named inline-size
container. Its existing stacked metadata arrangement is shared at the existing
720px boundary and scoped to `detail-summary-card`. It handles both semantic
row roles, keeps groups in DOM order, and lets narrow values wrap fully. The
obsolete Orig-only stack rules are removed; selection/history tables outside
the summary are excluded. No theme dimensions, palette values or permissions
are changed.

`AlbumTrackList` now shares intrinsic column tracks through its existing parent,
header and body instead of repeating fixed column templates. The text column's
inline-size contribution is contained so a long truncated name cannot push the
table beyond its card. Track names retain their full text and native title help.
Track layouts select their column count from their container's width, retaining
the existing 720/1024px boundaries and 8px field gap. Selection controls,
availability, runtimes, album-request semantics and the
existing bounded vertical scroller are preserved. Its active consumers are the
music detail layout and music request dialog.

## Reproductions and qualification

The book/music baseline has seven confirmed Orig failures: book English/Arabic
at 390/1440px and music at 320/390/1440px. The corrected video baseline has three
Orig movie failures at 320/390/1440px and nine passing TV/John cases. The first
video probe mistakenly called the new helper before its locator declaration;
those twelve insertion-order failures are invalid as product evidence and remain
retained. No behavior assertion was removed to repair that fixture.

Added Persius music coverage reproduces the hidden title at 320px and 73px artist
text overflow at 1440px; 390px passes. After the initial Orig trial, the existing
30 dialog cases pass, while the two added Persius cases still fail. After the
shared responsive repair, 32 of 33 cases pass; the remaining 320px table overflow
is isolated by measured column geometry. The final focused CSS trial passes all
three Persius widths and is not a compiled-artifact acceptance claim.

The maintained checks now verify definition-label/value alignment, DOM reading
order in stacked groups, shared track header/row coordinates, visible track names,
track and metadata overflow, existing geometry, quality changes, advanced options,
selection behavior, tag contrast and cancellation without acquisition. The book
cases retain English/Arabic coverage and Orig/John/Persius at 390/1440px; music
covers those three themes at 320/390/1440px; movie/TV covers Orig/John at all three
widths. Catalogue/service responses are replayed; authentication, native theme
persistence and production UI rendering are real against an isolated fixture.

The final compiled-production run passes all **42 cases**, including 1/12-track
music fixtures at each width. The strengthened shared check requires exactly two
tracks in stacked paired metadata, DOM reading order and horizontal painted
divider pseudo-elements. A compiled-main baseline fails the two-track check with
five tracks. Earlier green runs that lacked this assertion are excluded from
final acceptance; their screenshots revealed the remaining placement defect.

Final captures were visually inspected for Orig book at 390/1440px, Orig music
and movie at 1440px, John music at 390px, and Persius music at 320px and 1440px
with twelve tracks. Labels and values pair correctly, nested metadata precedes
status, track columns align, and narrow desktop dividers run horizontally.
The narrowest Persius track title remains ellipsized with its full native title
help; existing dialog padding and theme dimensions are preserved. Book fixtures
retain their saved Lagoon palette, so those images prove geometry and interaction,
not a fresh upstream colour comparison. Prior source-fidelity comparisons remain
separate. No Lumen frontend/theme CSS is changed here.

Production build, final Next rebuild, lint (existing warnings, no errors), server
and client type checks, 73 UI style checks and 51 contract checks pass. The
contract parser uses PostCSS's comma list parser so `:is(...)` selector commas do
not split a selector incorrectly; the negative Genres span contract remains
covered. The existing overflow suite now allows 90 seconds for its eight full
navigations per route instead of 30; all width assertions remain unchanged.

Exact-head CI and published-artifact qualification remain pending. This record
does not claim a published v3.72.25 artifact, exhaustive historical issue
completion or household-provider acquisition.

The subsequent `51f03737c` full CI completed the browser, build, Vitest and tooling
checks, but its native suite caught three stale source-contract checks: two still
named the old single-role selector, and the standalone example embedded the old
Orig stylesheet. The assertions now target the shared combined selector without
removing their row/span or negative checks. The generated example is refreshed
from its production source. All 26 detail-row/profile checks pass; matching
390/1440px baseline/candidate example renders are pixel-identical. This corrects
test/example synchronization, not application styling. The later PR619 viewer
repair and final combined CI remain separate qualification steps.
Evidence is retained in the November 7 task artifact directory under
`request-grid-final-qualified*`, `request-grid-final-*`,
`request-grid-owner-*`, `summary-pairs-*`, `request-responsive-*`, and
`track-width-*-trial*`. Initial
and superseded failures remain retained. Full-page screenshots can stitch a
fixed header at the document's scrolled position: separate viewport captures and
hit-testing proved the modal remains above the header; that capture artifact was
not treated as a stacking defect.
