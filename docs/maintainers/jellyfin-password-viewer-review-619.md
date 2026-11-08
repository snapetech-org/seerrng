# Password-linked viewer availability — PR619

Reviewed contributor head `b1c66b81f8d29d7c84bea9c7789bee94e6dbc199`.
The missing password-login credential is confirmed. The contribution is integrated
with its original ancestry and a repaired implementation; its proposed server-key
fallback is replaced with the contributor's suggested credential-persistence approach.

## Findings and repair

Existing-user and newly admitted Jellyfin/Emby password sign-ins omitted the viewer
token. Both now retain the authenticated token/device identity. Existing-user updates
remain limited to identity columns under the existing mutation guard: permissions
and other account state are not saved from a stale entity. Tokens remain excluded
from public responses. An existing password session without a retained credential
must sign out and sign back in through Jellyfin/Emby once.

An isolated official Jellyfin 10.11.11 server, two one-second synthetic videos and a
non-admin viewer restricted to one library established two additional boundaries:

- Disabling the viewer rejects its credential with HTTP 401, while a server API key
  can still query that viewer's items. The proposed fallback therefore cannot prove
  current viewer authority and is not retained.
- The exact-ID list lookup returned a movie outside the enabled library, including
  when an allowed parent was supplied. The user-item endpoint returned HTTP 404
  instead. Availability now uses that enforcing endpoint; viewer-scoped playback
  item reads reuse it too. An invalid requested viewer scope cannot downgrade to a
  server-wide read. Deliberately unscoped scanner/deletion reads remain separate.

The upstream [item-list controller](https://github.com/jellyfin/jellyfin/blob/v10.11.11/Jellyfin.Api/Controllers/ItemsController.cs)
and [user-item controller](https://github.com/jellyfin/jellyfin/blob/v10.11.11/Jellyfin.Api/Controllers/UserLibraryController.cs)
were inspected alongside these runtime observations. The latter resolves an item
with the requested user and retains the legacy user-item route for compatibility.

Denied watched-state reads now return an empty availability observation for
401/403/404 rather than a misleading service failure. Provider outages still fail
and are not converted to absence. No theme CSS or rendered geometry changes here.

## Qualification

- Four new password-route cases cover existing/new Jellyfin and Emby accounts,
  saved credentials, exclusion from the response and preserved permissions.
  The auth suite passes 152 cases. The initial combined native run had one
  transport-test assertion expecting a relative URL; the real transport receives
  an absolute URL. The corrected test asserts its pathname and preserves the
  endpoint requirement. API/availability qualification passes 40 cases.
- Nineteen watched-state cases pass, including both server types, movie/series,
  denial statuses and outage preservation. The collection/playback Vitest module
  passes 35 cases. An initial command also named a nonexistent playback test file;
  it is not counted as additional coverage.
- The actual compiled API's restricted playback catalog originally exposed a root
  item. After repair it is empty, and a direct playlist submission is rejected.
- Eight production-browser workflows pass at 390/1440px: Orig, John, native Persius
  and bundled Lumen. Real password sign-in updates the isolated database; allowed
  titles show availability/playback and the restricted title loses its link.
  Native workflows actually create the viewer's private current-selection playlist
  and open its returned URL, then close only that test popup. Lumen exposes the
  actual authorized Jellyfin item URL. Watched-state HTTP observations are checked.
- Allowed-title Orig/John/Lumen phone captures were visually inspected. Native
  dimensions and each theme's distinct arrangement remain unchanged. Full-page
  capture stitching of fixed navigation is separate from actual element overflow.
- Server compile/typecheck and changed-file lint pass. No live Emby server,
  household library, physical player, stream playback or published release image
  is claimed by this source qualification.

Evidence is retained in the November 7 task-deliverables directory under
`pr619-real-jellyfin-*`, `pr619-playback-catalog-baseline.json`,
`pr619-human-accepted*`, `pr619-viewer-playback-*` and `pr619-watch-status-*`.
Earlier browser fixtures incorrectly required an internal ID in the public
response, assumed the native playlist control was an anchor, and sampled the
Lumen method button before readiness. Their failures remain retained and are
excluded from product acceptance. Task avatar-cache directory warnings are fixture
setup observations, not a claim of a broken sign-in.

Exact final-head CI and the actual downloaded release artifact remain separate
delivery gates. The prior v25 handoff was stopped before creating a tag.

## Legacy-session recovery surfaced in the UI

`/auth/me` now adds `mediaServerSignInRequired` only for the current linked
Jellyfin/Emby account when its retained viewer credential is missing. It does not
serialize the credential or warn an unrelated account. The native shared warning
owner uses the existing Alert component; Lumen's Shell uses its original note and
small-button roles, linking to You and its existing Sign out action. No CSS,
Tailwind, theme tokens or dimensions were introduced.

The auth suite passes 153 cases, including account isolation, missing-token
warning and warning removal after reconnect. Production build, i18n checks and
changed-file lint pass. Eight additional production-browser workflows pass across
Orig, John, native Persius and bundled Lumen at 390/1440px. They start with an
actual local session whose Jellyfin credential is absent, inspect the notice,
use the visible account-menu Sign Out (or Lumen Open You → Sign out), perform a
real Jellyfin password sign-in, assert the warning clears, then repeat allowed
and restricted playback/availability checks. Real native playlist creation and
returned URL checks remain included.

Matched pre-change routes/themes/viewports are retained in
`pr619-reconnect-baseline`; candidates and functional results in
`pr619-reconnect-qualified*`. Phone comparisons and desktop candidate montages
were visually inspected for readable wrapping, button bounds and surrounding
layout. The baseline Lumen discovery catalog was still loading; those shelves
and changing external recommendations/ratings are excluded from pixel comparison.
The shared notice/header and candidate settled states are inspected; this is not
a claim that those changing catalog regions are pixel-identical. The first
candidate run used a five-second navigation assertion shorter than the existing
logout cleanup window and selected both rendered account menus in Persius.
Its failures are retained; the corrected assertions wait up to 15 seconds and
select the visible menu. All eight corrected workflows pass in 53.5 seconds.

Actual downloaded-image qualification and final-head CI remain required. Live
Emby, physical-device playback and household libraries remain untested here.
