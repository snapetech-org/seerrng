# Book language admission

Administrators can open **Settings → Metadata → Allowed book languages** and
enter comma-separated three-letter language codes, such as `eng`, `fre` or `ger`.
Leave the field empty to allow all languages. Save the setting before testing a
search or request. This is a server policy, separate from your display language
and your personal request-language preference.

Search and discovery filter book results against the policy. A request must use
a destination-verified edition in an allowed language. Choose ebook or audiobook
separately so the destination can verify the requested format. An unknown edition
language is not treated as an allowed language. Destinations that cannot verify
edition languages are blocked while the policy is active; ReadMeABook is one
such destination. Existing files are preserved.

If a request is rejected, choose a verified edition in an allowed language or ask
an administrator to review the policy. Changing the display locale will not
resolve a request-language rejection. See [book services](./bookshelf-backend.md)
and [Bindery](./bindery-backend.md) for destination setup.

Implementation: [settings control](https://github.com/snapetech-org/seerrng/blob/main/src/components/Settings/SettingsBookLanguages.tsx)
and [server admission policy](https://github.com/snapetech-org/seerrng/blob/main/server/lib/bookLanguagePolicy.ts).

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

The language-setting request is recorded in [SeerrNG issue #602](https://github.com/snapetech-org/seerrng/issues/602), reported by [@tmh20447](https://github.com/tmh20447).

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
