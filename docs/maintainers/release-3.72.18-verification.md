# v3.72.18 Verification

Published from `4ed550288c92b7a3b3af5c65b3da56f3ce6736a9` in
[release run 42324522743](https://github.com/snapetech-org/seerrng/actions/runs/42324522743).
The production image reports version 3.72.18 and that exact commit. Its manifest
is `sha256:0ac783e65a3771fb73af1df4ed493bde3ed811a302a07e9a250954dc41876cb5`.
The release has 29 assets; signing, attestations, both architecture image scans,
platform builds and required package gates passed. Snap was skipped because
its Store export credential is expired. The separate Chocolatey submission
returned HTTP 403; this is not a successful publication claim. Launchpad
publication remains asynchronous. Operational channel status belongs in the
release runbook and must be rechecked live.

## Source and Packaged UI Checks

Both SeerrOrig and SeerrNGJ were exercised at 390px and 1440px. Critical request
summaries additionally cover 320px. The source comparison covers 584 matching
signed-in route/state captures: 94 static and 52 dynamic routes in each theme
and viewport. Of those source pairs, 476 were identical and 108 differences
were visually inspected. The corrected populated static sweep supplies its
376 captures; an earlier unconfigured-provider sweep is excluded from matching
acceptance. Ten anonymous captures use the shared public theme; account-selected
SeerrOrig before authentication is not claimed.

The actual packaged image was then started read-only with dropped capabilities,
no new privileges, isolated configuration and an internal Docker network.
Its matching 584 signed-in captures have 495 identical pairs and 89 inspected
differences. Intentional differences include phone metadata/action wrapping
and the single music track layout. Other differences are version/log/cache
values, tiny focus/rounding and failed fixture artwork. Three routes with
loading-stage differences were additionally captured with matching settled
state assertions and baseline settings responses: services, webhook settings
and the unconfigured Plex library error state. All eight groups pass; 10 of
the 12 pairs are identical and two differ only in an empty error-state region.
This does not establish working live Plex, Chaptarr or ABS connections.

Twenty additional populated request, issue, blocklist and legacy-issue redirect
pairs pass; 14 are identical and six differences were inspected. The legacy
issue path reaches its populated detail region. Four Japanese setup-help
cases pass in each baseline/candidate group; the corrected message wraps in
both themes and accurately places the variable on ChaptarrNG.

The packaged critical checks pass 51 cases, including eight book states in both
themes/viewports, Columbo request geometry, persisted theme switching, music,
calendar status, RTL restoration and repeated rating-popover motion sampling.
Fifty passed on the internal image address; the theme test completed its
persistence assertions but failed its console check on Chrome's COOP warning
for a private HTTP origin. Its isolated retry through a loopback TCP endpoint
passes with normal browser security enabled. The original failure and trace
remain retained; no product assertion was removed.

Five of six compiled CSS files match the local build byte for byte. The global
sheet differs only by 17 unused generated Tailwind utility rules and their
numeric-variable initialization; shared semantic rule declarations match.
Both served theme CSS packages match the qualified source exactly. This is
not a claim that the full compiled global sheets are byte-identical.

## Automated Qualification and Bounds

[Full implementation CI 42319087257](https://github.com/snapetech-org/seerrng/actions/runs/42319087257)
passed 4,693 native tests (4,688 passing, five intentional skips), all Vitest
shards, Playwright, Cypress, lint/typecheck/build, docs, Helm and the bridge
plugin. The only runtime-source difference afterward is the corrected
Japanese message, covered by its production rebuild, catalog provenance
check and rendered comparison. Exact release-head
[contracts 42324340568](https://github.com/snapetech-org/seerrng/actions/runs/42324340568)
pass. Full follow-up CI at `a470327f1` is separately recorded in
[run 42323705586](https://github.com/snapetech-org/seerrng/actions/runs/42323705586);
its state must be read from that run rather than inferred from this record.

PRs #592 and #593 were genuinely merged after patching and review. Lumen's
21 native/proxy checks and 211 browser checks passed, with 24 matched visual
states inspected. Android passed ten unit and 15 connected API-36 checks,
with phone/tablet light/dark comparisons against the public baseline APK.
Physical devices, every older OS and live household playback are not claimed.

The later ABS review found an additional ebook-only classification defect.
Issue #409 deliberately remains open while that separate follow-up is verified
and shipped; v3.72.18 does not claim to contain it.

Detailed logs, traces, screenshot indexes, comparisons and initial harness
failures are retained under the task delivery directory
`seerrng-incoming-review-20261106` on scratch storage.
