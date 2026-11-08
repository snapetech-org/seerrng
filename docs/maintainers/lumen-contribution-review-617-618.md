# Lumen contributions #617 and #618

Reviewed contributor heads `d747f8b2c0ff6159da41208bad70181e6996084a`
and `6fb682fd80950e8b5f60b7cc56e8b301058be434`, including their full
diffs, API/cache/session consumers, nginx entrypoint and trusted-proxy ownership.
Both contributions are useful and retained as merge commits; neither is discarded.

## Request budget and saved cache

Concurrent reads share a promise per identity/path; frequently checked answers
remain fresh for 15 seconds. Successful mutations still invalidate the cache.
The saved copy is bounded to 150 entries and 1,000,000 JavaScript characters,
excluding individual entries over 100,000 characters. This is a character cap,
not a promise of one megabyte of browser storage. The existing blocked/full
storage fallback remains in memory. Identity resets remove the prior account's
saved copy. Authorization continues to be enforced by the server; sign-in's
current `/auth/me` call does not use the briefly fresh hook cache.

Review found an outstanding response could repopulate the cache after a mutation
cleared its in-flight map. Added a cache generation guard to reject earlier
response writes after mutations, explicit invalidation and same-account sign-in
resets. Regression coverage completes an old request after a newer answer and
proves the new availability remains fresh. The contributor's poster-page check
measures settings request counts on 40 cards and immediate navigation.

## Custom unprivileged container user

Generated nginx configuration, temporary request files and the PID are writable
under `/tmp`; the application and configuration templates retain their existing
read-only ownership. The default remains nginx's unprivileged UID. The custom
UID tests cover 1000 and 4242, capability drop, no-new-privileges, read-only root
filesystem and a writable `/tmp` tmpfs. They verify the process UID, static-page
and API response, static application non-writability and writable admin-data
capability. Existing authenticated config-write/upload and forwarding-header
tests remain enabled. Trust is still limited to operator-configured connecting
proxy addresses; moving its generated file does not broaden the trust list.

The fixture data folder is deliberately world-writable to permit both test UIDs;
this is not an installation recommendation or a test of host chown permissions.
The guide instructs owners to match the mounted folder's owner to `user:`.

Locked npm install, Lumen build, unit/proxy checks and browser qualification are
recorded with the final source/release receipts. No new frontend styling or theme
dimensions are introduced by these contributions. This bounded review does not
certify every historical contribution or a not-yet-published release artifact.
