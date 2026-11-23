# Third-party PR and branch security check — 2026-11-22

## Live repository state

- GitHub reports `main` as the only branch in `snapetech-org/seerrng`.
- The open PR query is empty. There is no pending third-party contribution to
  merge or approve.
- Local tracking refs for `upstream`, `pr-author`, and other forks are not
  branches in the SeerrNG GitHub repository and were not merged into `main`.
- The existing [contribution security review ledger](evidence/2026-11-06-contribution-security-review.json)
  records 60 external human PR reviews through PR #604. The merged PR history
  currently contains 95 non-bot PRs by non-owner accounts; the newer range was
  triaged by changed paths and risk, with the server, container, image, cache,
  authentication, and outbound-integration surfaces checked below.

## Security-sensitive paths inspected

- **[PR #619](https://github.com/snapetech-org/seerrng/pull/619), Jellyfin/Emby viewer availability:** its proposed fallback from a
  missing viewer credential to the server API key was rejected before merge.
  An isolated Jellyfin test showed that the server key can read a disabled
  viewer's items and an item-list endpoint can disclose items outside that
  viewer's library. The merged implementation persists the credential from
  password sign-in, uses the enforcing viewer-item endpoint, and requires
  sign-in recovery for legacy sessions. The implementation, runtime evidence,
  and regression coverage are recorded in
  [the PR #619 review](jellyfin-password-viewer-review-619.md).
- **[PR #618](https://github.com/snapetech-org/seerrng/pull/618), arbitrary unprivileged container user:** Nginx trusts forwarded
  addresses only from explicitly configured proxy networks; the default trusts
  none. The generated real-IP configuration is created in the container's
  writable temporary directory. The startup script validates the selected
  header and proxy-address syntax.
- **[PR #652](https://github.com/snapetech-org/seerrng/pull/652), shared settings and branding upload:** mutations require
  administrator authorization and the standard mutation guard. Uploads are
  limited to 2 MiB, restricted to PNG/JPEG/WebP signatures, decoded with a
  pixel bound, resized and re-encoded, and stored under random exclusive
  filenames. The read route validates the filename and confines `sendFile` to
  the branding directory. No path traversal or executable-image path was
  found.
- **[PR #688](https://github.com/snapetech-org/seerrng/pull/688), Hardcover covers:** the image proxy maps the type to the fixed
  `assets.hardcover.app` host. User input supplies only a bounded image path;
  the shared proxy rejects URL-like paths, limits requests, and serves raster
  content. This does not add an arbitrary server-side URL fetch.
- **[PR #717](https://github.com/snapetech-org/seerrng/pull/717), Radarr poster fallback:** the route is under authenticated movie
  and TV category guards, parses identifiers, and selects only a configured
  Radarr service. It does not accept a caller-supplied server URL or API key.
- **[PR #718](https://github.com/snapetech-org/seerrng/pull/718), Chaptarr remote covers:** the response value is accepted as an HTTP(S) URL by the server mapper, but Lumen renders HTTPS URLs only. The URL is used for display and not as a server-side fetch URL;
  the Lumen artwork helper proxies only recognized hosts and otherwise loads
  the image directly with no referrer.
- **[PR #634](https://github.com/snapetech-org/seerrng/pull/634), persistent provider cache:** only caches marked persistent are
  snapshotted, using a 0700 directory and 0600 files. External API cache keys
  include a digest of request scope; provider credentials are not written into
  keys or snapshots. Snapshot sizes, entry bounds, and stale lifetimes are
  constrained.
- **[PR #662](https://github.com/snapetech-org/seerrng/pull/662), BackIssue connection:** the LAN/private-address allowance is
  limited to the administrator-configured BackIssue endpoint, which is needed
  for an on-prem service. Its API key stays in the server-side client. This is
  a privileged outbound integration, not an arbitrary user-controlled URL.
- **[PRs #683 and #684](https://github.com/snapetech-org/seerrng/pull/683), Bookshelf request reconciliation:** recovery is limited
  to a unique verified local record and rechecks edition, format, work identity,
  request ownership, and routing before linking. Ambiguous matches are left
  untouched; the scanner avoids importing or fetching unrelated catalog
  records.

No unpatched exploit or newly introduced user-controlled SSRF primitive was
identified in these reviewed paths. This check closes the current open-PR and
security-sensitive recent-merge review; it is not a fresh line-by-line review
of every historical UI-only change. Continue the normal source-and-test review
before merging any future third-party PR, with specific scrutiny for
authentication, authorization, input-to-network paths, and secret handling.
