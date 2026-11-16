# BookOrbit request and reader recovery

Reported symptoms: an old Bookshelf service could not be removed, Requests
showed the generic Oops page, and the BookOrbit reader connection test failed.
BookOrbit acquisition itself was working.

## Findings and changes

- The reader adapter did not require a direct connection for private/LAN
  addresses, unlike the acquisition adapter. A real loopback HTTP regression
  fails with `ECONNREFUSED 127.0.0.1:1` when environment proxies are set;
  the correction bypasses proxies for private reader addresses while preserving
  exact passwords, URL bases, bearer authentication, and redirect restrictions.
- The shared request summary called `.filter()` on an omitted TV-season relation
  even for book requests. A rendering regression reproduces the exception and
  verifies the empty-relation fallback.
- Requests now isolates rendering errors to a single request card. A full-page
  React DOM test supplies malformed book subjects and verifies that tracked
  status, the delete confirmation, and a healthy neighboring request survive.
  This contains other unexpected metadata errors; the reporter's exact browser
  stack was unavailable, so it is not established that the season-relation
  defect caused their particular `/requests` failure.
- Deletion still protects servers referenced by active requests. The conflict
  now gives up to ten ordered request IDs, the full reference count, and a
  recovery instruction. Delete the stale request entries in Requests before
  removing the old service; this does not delete library files. Do not bypass
  the reference guard or silently redirect existing acquisitions.

No ChaptarrNG source defect was found in these paths.

## Validation

- 103 targeted tests passed across request rendering, reader HTTP contracts,
  service settings/API schemas, and historical service ID allocation.
- Server/client typechecks, changed-file ESLint, shared UI ownership checks,
  current-batch contracts, and i18n source/catalog checks passed. Existing
  translation coverage warnings remain separate from source consistency.
- Commit hooks passed attribution, formatting, lint, Semgrep (zero findings),
  and stable-container-alias checks.
- Added native Playwright cases at 390 and 1440 CSS pixels for normal book
  metadata, a malformed-metadata card, retained status, overflow, and the
  delete confirmation. The normal and recovery screenshots are CI artifacts.
- A clean leased Chrome desktop rendered synthetic normal/recovery fixtures
  at the same 1024-pixel viewport using the existing shared CSS and SeerrNGJ
  theme. The recovery card retains the existing surface, padding, text, and
  action owners. Full application navigation in that desktop was blocked by
  its deliberate private-network egress policy; the read-only fixture preview
  exposes only synthetic HTML, CSS, and fonts. Full native-route browser
  acceptance is delegated to the hosted Playwright job, not inferred from
  static previews. The temporary preview is removed after review.

Local evidence is retained under
`/home/keith/Documents/code/.task-deliverables/seerrng-bookorbit-20261116/`.
Release preparation also corrects the invalid area slug in the previously
unshipped BookOrbit pasted-address fragment; shipped release fragments remain
unchanged.
