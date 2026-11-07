# Lumen contribution592 review

The original contribution head is3e5d25d596149699723057a1d99dfd5613e04f10.
PR592 adds family sign-in, branding, administrator configuration export, request
destination selection, service-aware navigation, bounded browsing, recovery and
phone interaction improvements. Those features are retained.

The review repairs the following confirmed defects before integration:

- Manager IDs no longer count as book files. Format-specific imported-file
  observations, independent Audiobookshelf items and the public Plex audio flag
  drive book badges and library filtering, including serviceID0.
- Quick requests wait for complete destination options. Late server-detail
  responses cannot replace a newer selection.
- Malformed preference configuration and category-probe storage cannot crash the
  application. Known preferences are type-checked; blocked preference storage
  retains working in-memory controls.
- Category-probe results retain the initiating account's storage key even when
  they arrive after another account signs in.
- Numeric and HTTP-date Retry-After deadlines are respected within the existing
  abortable settings-loading deadline, rather than retrying after at most6seconds.
- Back navigation restores previously typed search values while older typing
  updates remain suppressed.

Five new browser regressions fail against the contributor's original production
build: premature submission, malformed preferences, manager-only book badges,
malformed probe storage and cross-account probe writes. The patched production
build passes TypeScript,13 focused unit tests and211 browser checks across
desktop1440px, iPhone390px, Android393px and tablet834px profiles. One desktop
typing case is skipped because it exercises the phone search input. Provider
responses are fixtures; no live request or household mutation is claimed.

Matching light/dark settings, request-sheet and family-sign-in captures cover all
four viewports. Initial captures caught opening/theme transitions; the final
harness waits for the selected theme and sheet animations and checks both footer
buttons remain in the viewport. Contact sheets were visually reviewed. No CSS
was changed by the review repairs. The contributor's new styles remain within
Lumen's existing standalone semantic owners, separate from native Seerr themes.
The initial comparison has24 pairs; the final pixel comparison is retained with
the screenshots. Exact-head hosted proxy/image/security validation remains the
integration gate.

Untrusted build and browser execution used disposable containers without host
credentials, with read-only source/dependencies and task-owned output mounts.
The browser container had no external network. Artifacts are retained in
incoming-review20261106 under `lumen-*`; source patch hashes are recorded in the
same deliverables. Native related-title availability from the real-server report
is separately fixed in adf421d79 and documented in related-viewer-availability.md.
