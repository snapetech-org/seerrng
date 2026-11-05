# Media access contribution recovery (2026-11-05)

This recovery preserves the original histories of #467, #478, #479, #480,
#481, #482 and #485. The two Quick Connect contributions are combined under
`jellyfinQuickConnectOnly`, retaining API enforcement for password and plugin
bridge sign-in and the parent media-server-login gate. Legacy `quickConnectOnly`
settings migrate before defaults are merged; explicitly configured canonical
settings win. Temporarily disabling Jellyfin sign-in preserves the policy.

Linked Plex, Jellyfin and Emby accounts receive viewer-scoped availability checks.
The checks use fresh linked credentials, bounded provider concurrency and response
budgets, and independent standard/4K identities. Unverified access hides playback
links and availability rather than asserting access. Accounts without a linked
provider retain their existing availability behavior. Destination-specific request
completion still requires evidence for the requested destination.

Review reproduced and repaired three projection defects: a denied TV check could
throw when seasons were not loaded; cached native IDs could be reused for a
different external title identity; and provider metadata without corroborating
identity could count as access. Cache keys now include external identity and
provider metadata must corroborate it without conflicting known IDs. Plex
connection settings are snapshotted before asynchronous checks.

Initial Jellyfin setup also requires affirmative provider administrator proof;
missing policy fields cannot create the owner. Preconfigured connection fields,
libraries and API keys survive the first owner sign-in without key rotation.

## Validation

Native regressions cover API policy enforcement, setup, destination-specific
completion, credential rotation, viewer-visible Jellyfin seasons, title identity,
response budgets, independent quality variants and bounded Plex watchlist
hydration. A timed-out watchlist item preserves the rest of the page; provider
authentication failure does not return a partially authorized page. Production
build, server types and changed-source lint pass.

Headless Chromium baseline and candidate renders use matching 1440×900 and
390×900 viewports. Eight login checks cover ordinary and Quick Connect-only
Jellyfin, Emby and Plex/local sign-in. Two settings checks cover the nested policy
control, parent toggle, retained selection and saved payload. Screenshots were
compared for control geometry, spacing, text wrapping, surfaces and overflow.
The existing LabeledCheckbox and login button owners remain in use; no CSS
dimensions, spacing or theme values were added. The baseline lacks the policy
control and continues showing the Jellyfin password form as expected.

Evidence lives under
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`
in `access-*` logs, screenshots, traces and comparisons. Initial browser failures
used an incorrect test locator (`Save Changes` instead of the existing `Save`);
the corrected settings checks pass. Provider responses are controlled fixtures.
Live provider ACL changes, physical device handoff and individual episode access
are outside this validation; season projection does not certify episode access.
Full owner CI remains required before merge.
