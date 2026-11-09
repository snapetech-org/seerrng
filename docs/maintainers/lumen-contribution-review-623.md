# Lumen request and filtered browsing review — PR623

Contribution: ncbudd, original commit
`05f9bbc2bf9f715c93a3639386865ad6d4b7c270`. Retain this commit as a merge
parent; useful fixes must be merged, not closed without integration.

## Findings and repair

Selecting the currently selected quality reset readiness without remounting
AdvancedOptions, leaving the visible Request button inert. Ignore an unchanged
quality; genuine HD/4K changes still remount their own server options. Review
coverage additionally checks both selected qualities, one request, and the
existing HD-omits-is4k / UHD-is4k-true payload contract.

Filtered Browse capped all views at five pages, including productive lists.
Count five-page windows since the last screenful of matching results instead.
The list fills a screen, continues on scroll, stops after sparse windows and
retains explicit Look further. Existing sparse-limit and error/retry tests
remain. Movies and Series share the same owner and query/filter identity.

The shared Lumen `.btn-primary:disabled` owner dims unavailable primary actions
and removes the active transform without changing geometry or tonal status
labels. Consumers include RequestSheet, request edits, TV/book detail, sign-in
and administrator settings. No native theme, authorization, API, dependency,
credential, provider mutation, or proxy changes were introduced. No new
security primitive was found in the four contributed files.

## Qualification and visual acceptance

- Both original regressions fail on main `773e93c92` in all four browser
  projects: productive lists stop at page five and selected HD disables Request.
- Reviewed candidate: **523 browser passes, 13 existing viewport skips**.
  Added selected UHD and busy sign-in coverage; the sparse five-page/Look further
  test and existing permission/server/quality isolation cases pass.
- Matched baseline/candidate views: desktop 1440×900, iPhone 390×664,
  Android 393×727 and tablet 834×1194 (actual configured project viewports).
  Thirty-six paired captures cover light/dark settings, request sheet, sign-in,
  request loading/ready and busy sign-in. Twenty-eight ready/unmodified captures
  are pixel-identical; eight differ only at intended disabled actions.
- Desktop and phone captures were visually inspected for readable surfaces,
  geometry, alignment, button states and overflow. Final screenshot capture
  disables finite animations to avoid accepting an opening-animation frame.
  Earlier diagnostic captures and two corrected review-test assumptions are
  retained separately; they are not candidate acceptance evidence.
- Production dependency audit passes with no reported vulnerabilities.

Evidence: task deliverables `pr623-*`, notably
`pr623-full-browser-final.log`, `pr623-final-paired-visual-comparison.json` and
`pr623-final-paired-{desktop,iphone}.jpg`. Browser data/API replies here are
isolated fixtures, not live household requests. Integrated production build,
final-head Lumen CI and downloaded-release verification remain release gates;
the local browser count alone does not prove publication.
