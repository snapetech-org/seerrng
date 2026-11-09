# External request lists

Open your profile's **Settings → General → External request lists** to connect
a public IMDb watchlist or Goodreads to-read shelf. Hardcover Want to Read uses
your personal Hardcover API token. These are request inputs, separate from
[discovery tracker accounts](./discovery-integrations.md) and local watchlists.

Lists are checked daily. **Sync now** requests an immediate check and reports
requested, already-requested, unmatched and failed counts. New items go through
your normal category permissions, quotas and approval policy; connecting a list
does not bypass those rules. A failed provider response is shown as a sync error.

If IMDb blocks server-side access, export your watchlist from IMDb and use
**Import IMDb CSV export**. Files must be at most 5 MB. Review the sync summary
and any unresolved matches. Public lists must use a supported provider URL;
arbitrary remote URLs are not accepted.

**Remove** disconnects a list from future synchronization. It does not retract
requests already created or remove downloaded media. Keep personal tokens secret
and disconnect a list when you no longer want automatic request inputs.

Implementation: [profile control](https://github.com/snapetech-org/seerrng/blob/main/src/components/UserProfile/UserSettings/UserGeneralSettings/ExternalRequestLists.tsx)
and [list routes](https://github.com/snapetech-org/seerrng/blob/main/server/routes/externalRequestLists.ts).

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
