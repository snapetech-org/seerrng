# Lumen compressed-session repair — November 7, 2026

Issue [#601](https://github.com/snapetech-org/seerrng/issues/601) was found while
checking the first published Lumen image against the actual published SeerrNG
v3.72.22 image. Local-account sign-in and the admin settings page worked, but
Save for everyone returned 502: “SeerrNG didn’t say who you are.”

The internal `/_lumen_session_check` inherited the browser's Accept-Encoding.
SeerrNG returned its 1,960-byte authenticated user JSON with gzip encoding. The
njs configuration handler parses the subrequest body itself and received
compressed bytes. An authenticated API probe returned 502 with gzip and 200
with identity encoding. The earlier integration fixture returned only a short,
uncompressed permissions object and missed this boundary.

The proxy now clears Accept-Encoding only on that internal subrequest. Normal
API/image responses keep their existing compression behavior. Cookie forwarding,
the live backend account check, administrator authorization, body/type limits,
and the distinction between public folder-capability GET and protected writes
remain intact.

The real-nginx test's backend fixture now compresses a realistically sized auth
response when the client accepts gzip. Before the repair its family-account
check returned 502 instead of 403; after it, all 27 native Lumen tests pass,
including unauthorized and family write denial, admin persistence, branding,
proxy identity and malformed inputs.

A container loaded from that exact tested image archive was then connected to
the actual SeerrNG v3.72.22 runtime with a separate writable data folder. Two
headless cases (390/1440) sign in through Lumen's local-account UI, open You →
Lumen settings for everyone, change the media-server display name, save, reload,
restore the original value, save again and reload. Both pass. Anonymous config
PUT is denied. No real user account, provider settings or media were changed.

The public v3.72.22 Lumen image is immutable and still contains this bug. The
source repair requires a new published version before #601 and the complete
prebuilt-install workflow in #598 can be closed. Compose remains on its working
source-build default until a fixed public image is verified.

Evidence remains in the task deliverables: the failed published-image cases,
compression probe, failed compressed-auth regression, 27-pass native run,
exported image archive and two successful real-backend browser cases. This is a
bounded configuration/authentication check, not a live Plex playback test.
