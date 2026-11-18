# Visible Lumen administration — 2026-11-09

## Defect and repair

The reported Lumen sidebar had no administrative entry points. Presentation settings and the full SeerrNG escape existed only near the bottom of You, so administrators could reasonably conclude that their controls had disappeared.

The desktop sidebar now exposes **Administration → Lumen Settings / SeerrNG Administration**. You shows the same destinations immediately below the account card on phones and tablets. The second link uses the existing `fullSeerrUrl` owner, retaining same-origin `/seerrng`, configured companion destinations, protocol validation and the classic-interface escape. Full configuration pages remain in native SeerrNG; this change does not claim those pages were rebuilt inside Lumen.

The existing `.side` CSS owner now scrolls vertically and its links retain their established height instead of shrinking on short screens. Existing sidebar, section, settings-list, action and icon owners supply all other styling. No new CSS family or Tailwind utility was introduced. A shared administrator predicate rejects malformed masks across navigation, You and Lumen Settings; server authorization remains authoritative.

## Qualification

Baseline: main `80cea98db28ae773afa6656c2110a56c71a2031b`. The Lumen implementation is `ef64f416a`; its rendered/browser qualification used that source. Delivery also preserves concurrent BookOrbit commit `dbc36efad` through merge `ab5d19a6f`. That merge changes no Lumen runtime files; its eight targeted BookOrbit tests passed. Its four missing source fingerprints were generated with the canonical i18n snapshot tool. Final combined build evidence is `integrated-production-build-final.log`.

- Full production build passed, including Lumen TypeScript/Vite and Next/server builds.
- Lumen native tests: **33 passed**, zero failures or skips.
- Headless Chromium browser suite (`admin-navigation`, existing `admin-options`, `theme`): **363 passed, one existing skip**, across desktop, iPhone, Android and tablet projects. Includes regular accounts, delegated settings-only accounts, malformed masks, configuration URLs, presentation settings, request controls, storage recovery and theme switching.
- Matching baseline/candidate rendered comparison: **16 states**, light/dark × 1440×900, 1280×640, 1024×768 and 390×844. Routes `/`, `/me`, `/me/lumen`; all extra categories enabled. Inspected navigation geometry, wrapping, action reachability, profile placement, neighboring content and horizontal overflow. Links open the actual Lumen Settings page. Short desktop navigation scrolls without squeezing rows; phone/tablet entry points remain above request limits. No page errors or horizontal overflow in these states.
- Actual bundled production app: synthetic seeded administrator and regular accounts signed in using real CSRF/session endpoints. Administrator navigated from `/lumen/` into Lumen Settings and then through `/seerrng` into visible native Settings, preserving the same authenticated user and classic-interface cookie. Mobile `/lumen/me` exposed both links. The regular account had neither admin link, saw the direct Lumen Settings denial, and received **403** from `/api/v1/lumen/config`; administrator received **200**.
- Root ESLint applied to the touched Lumen files reports the **same 30 pre-existing findings** on baseline and candidate (22 relative-import rules, seven existing label rules, one existing caught-error rule). No rule was disabled. Changed files pass Prettier and diff whitespace checks. The full production build verifies the restored shared dependency cache is usable.

## Evidence and exclusions

Evidence retained on kspld0 at `/mnt/disks/scratch/task-deliverables/seerrng-lumen-admin-20261109/`: baseline/candidate viewport PNGs, `visual-report.json`, `visual-qa-qualified.log`, `browser-tests-qualified.log`, `lumen-unit-tests.log`, `production-build.log`, `embedded-qa-final.log`, `embedded-report.json`, `embedded-admin-phone.png`, `embedded-native-settings.png`, and baseline/candidate lint JSON.

Synthetic accounts, empty catalog responses and isolated config only; no household provider writes. Production fixtures skipped migrations and periodic jobs, so this does not qualify migrations or real provider availability. The companion URL behavior was browser-tested with fixtures; no household sidecar was modified. Native settings navigation was tested, but this work does not requalify every native settings page or theme.

Excluded harness attempts used WebKit device defaults with a Chromium executable, an incorrect tablet breakpoint, a nonexistent storage endpoint, or a hidden native-sidebar selector instead of the visible Settings heading. The isolated install initially targeted a shared dependency symlink; it was stopped and the original cache was restored using its frozen lockfile and offline package store, then reinstalled after isolation was corrected. Setup logs remain retained. These attempts are not counted as product acceptance.

## Network settings follow-up — 2026-11-18

The administration list on `/me` now opens `/admin/network`. The bundled and standalone settings bookmarks redirect to that same screen. The screen uses the existing server network settings mutation for partial saves and reads runtime TLS status before allowing transport edits. Network settings and transport status bypass the Lumen response cache.

Compared dark-theme screenshots of `/me` before and after the navigation change and of the new settings form against the shared controls on baseline `/admin/general` at 1440×900, iPhone 13, Pixel 7, and iPad Pro 11. Inspected section surfaces, control sizing and wrapping, button alignment, and navigation placement. The browser checks cover administrator and regular accounts, a rejected and retried save, and an environment-owned TLS configuration. The browser API fixtures use synthetic settings. Live reverse proxy, TLS restart, and household sign-in changes were excluded.

Baseline `ad430864b`. Screenshots and test logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-network-20261118/`.

## Discovery credentials follow-up — 2026-11-18

`/me` opens `/admin/discovery` for administrators. The form reads public provider configuration and sends credential changes through the existing authorized PUT endpoint. Previously saved secrets never populate inputs. Clearing credentials stages removal until Save. A rejected save preserves the draft.

Compared the initial form against the shared Network Settings controls from baseline `a5b76acad` on desktop, iPhone 13, Pixel 7, and iPad Pro 11. Inspected the title wrap, section and row spacing, input widths, and action sizing. A production Lumen build and four browser checks passed, including failed-save recovery and horizontal overflow checks. Secrets were synthetic. Curated identity pack management still uses native Discovery Integrations.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-discovery-20261118/`.

## Shared title-match packs follow-up — 2026-11-18

Discovery Integrations now supports preview, acknowledgement, publish/replace, export, and confirmed deletion. The standalone and bundled settings bookmarks open the Lumen page. The standalone proxy accepts pack uploads up to the API's 5 MiB limit for that endpoint.

Compared baseline `0d45bf7d8` Discovery Integrations against the populated replacement preview at matching desktop, iPhone 13, Pixel 7, and iPad Pro 11 viewports. Inspected form and row widths, action wrapping, and mobile navigation clearance. The first mobile captures exposed horizontal overflow from the unstyled file input. The final captures use the shared upload control and all eight browser checks passed on the production build. Ten standalone proxy tests and two bundled frontend tests passed. Synthetic packs only, with no changes to a household instance.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-packs-20261118/`.

## Metadata providers follow-up — 2026-11-18

The administrator's `/me` menu and bundled and standalone metadata bookmarks now open `/admin/metadata`. TV and anime, music provider limits, and book languages use separate forms backed by the existing metadata settings API. Connection errors preserve the results for individual providers and leave the draft available to retry.

Compared the new form with the approved shared Network Settings controls at 1440×900, iPhone 13, Pixel 7, and iPad Pro 11. Inspected select and input wrapping, actions, and status rows. The production Lumen build, four browser cases, ten standalone proxy cases, and two bundled routing cases passed. The browser cases used synthetic provider responses and verified independent saves, normalized book-language codes, failed connection status, and horizontal overflow. Live provider connectivity was excluded.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-metadata-20261118/`.

## Bookshelf library migration follow-up — 2026-11-18

Administrators open `/admin/library-migration` from `/me` or the bundled and standalone settings bookmarks. Lumen uses the existing BookshelfNG move API for library selection, preview, explicit confirmation, and command polling. Destination or author changes invalidate the preview. A conflicting preview cannot start a move.

Compared the configuration and expanded file preview with the established Network Settings form controls at matching desktop, iPhone 13, Pixel 7, and iPad Pro 11 viewports. The first comparison exposed side-by-side disclosure content on wide screens. The final comparison uses the shared disclosure owner and shows detail rows beneath the author heading. The final production build and four browser checks passed. Ten standalone proxy tests and eight native routing/API tests passed. Validation used isolated synthetic authors and commands. No live library was moved.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-migration-20261118/`.

## Instance email and Web Push follow-up — 2026-11-18

Administrators can open `/admin/notifications` from `/me` and save or test email and Web Push independently. Stored SMTP and PGP credentials remain redacted, and a test uses the draft without saving it. The email API now persists the existing Use the Public Logo option.

Compared the form with shared Network Settings controls at 1440×900, iPhone 13, Pixel 7, and iPad Pro 11. Inspected control and action wrapping, long heading and credential notices, and horizontal overflow. The Lumen production build, four browser checks, and the focused server API case passed. Test deliveries were mocked. Other instance notification channels and their old bookmarks still use native settings.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-notifications-20261118/`.

## Instance messaging notifications follow-up — 2026-11-18

`/admin/notifications` adds independent Telegram, Pushbullet, and Pushover forms with event selection and draft test sends. Inputs keep saved credentials redacted. Pushover sound choices use the existing server lookup. Account notification preferences reuse the same event controls.

Compared the shared form rows and credential actions against the Email baseline from `7f6752ecc` on desktop, iPhone 13, Pixel 7, and iPad Pro 11. The production build, eight instance browser checks, and four managed notification browser checks passed. The browser used mocked settings and sound responses. No live messages were sent.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-messaging-20261118/`.

## Gotify, ntfy, and Apprise follow-up — 2026-11-18

`/admin/notifications` adds Gotify, ntfy, and Apprise configuration, event selection, authentication options, and draft tests. The existing ntfy settings API now retains tags during save and test.

Compared the new controls with the Telegram form at matching desktop, iPhone 13, Pixel 7, and iPad Pro 11 viewports. Inspected rows, credential masking, input and action wrapping, and horizontal overflow. The production build, twelve instance notification browser cases, and three native API cases passed. Browser deliveries used mocks.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-agents-20261118/`.

## Discord and Slack follow-up — 2026-11-18

`/admin/notifications` adds Discord and Slack configuration and draft tests, including Slack request approval actions. Saved webhook URLs and signing secrets remain redacted. The existing Discord API now retains thread IDs during save and test.

Compared the rendered Slack form against the existing ntfy form on desktop, iPhone 13, Pixel 7, and iPad Pro 11, including credential rows, multiline settings, and event controls. The production build, 16 notification browser checks, and four Discord and Slack API tests passed. Delivery used mock endpoints, and no live Slack actions were invoked.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-chat-notifications-20261118/`.

## Generic Webhook follow-up — 2026-11-18

`/admin/notifications` adds the Webhook destination, JSON payload editor, authorization, custom headers, URL variables, event selection, and draft test sends. Existing header values stay redacted. Renaming a saved header requires a new value. The editor retains readable JSON after a successful save.

Compared the Webhook form with the established Slack form across desktop, iPhone 13, Pixel 7, and iPad Pro 11. Inspected credential prompts, JSON editor width, header rows, and action wrapping. The production build, twenty notification browser checks, and four API checks passed. The four Webhook browser cases also passed after adding visible prompts for empty header inputs. All sends were mocked.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-webhook-20261118/`.

## Notification channel navigation follow-up — 2026-11-18

The instance notifications page now provides a direct link to every channel. A direct link loads only the selected channel's settings. The previous notification settings paths within bundled and standalone Lumen redirect to the matching channel.

Compared the selected-channel layout against the existing form at matching desktop, iPhone 13, Pixel 7, and iPad Pro 11 viewports. Checked active link styling, control wrapping, and form width. The production build, 24 browser cases, ten standalone proxy cases, and two bundled routing cases passed. Browser settings and deliveries used mocks.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-notification-links-20261118/`.

## Prowlarr connection follow-up — 2026-11-18

Administrators can open `/admin/prowlarr` from `/me` to configure or test a connection and review indexer diagnostics. The saved API key stays hidden. Category mappings, category-specific indexer assignments, and per-indexer limits still use native settings.

Compared the rendered connection form with Network Settings at matching desktop, iPhone 13, Pixel 7, and iPad Pro 11 viewports. Inspected field widths, wrapping and action placement. The Lumen production build and four browser cases passed with synthetic settings and indexer responses.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-prowlarr-20261118/`.

## Prowlarr indexer routing follow-up — 2026-11-18

`/admin/prowlarr` now edits category mappings, category-specific indexer assignments, and per-indexer limits. Empty assignments and cleared overrides retain their distinct server meanings. Existing Prowlarr settings bookmarks within bundled or standalone Lumen redirect to this page.

Compared the connection area with the preceding Prowlarr baseline and inspected category, assignment and override rows at matching desktop, iPhone 13, Pixel 7, and iPad Pro 11 viewports. The production build, eight browser, ten proxy, and six server tests passed. Indexer responses were synthetic.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-prowlarr-mappings-20261118/`.

## Media server libraries follow-up — 2026-11-18

Administrators open `/admin/media-libraries` from `/me`. The page uses the instance's actual media server selection to refresh libraries, enable or disable indexing, set series episode order, reclassify Plex audio libraries, and start, cancel, or monitor scans. Connection configuration remains in native settings.

Compared the shared controls and library rows with Network Settings at desktop, iPhone 13, Pixel 7, and iPad Pro 11 sizes. The production Lumen build and twelve browser checks passed for Plex, Jellyfin, and Emby. Browser fixtures used synthetic libraries and scan commands. No live server configuration was modified.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-media-libraries-20261118/`.

## Media server connections follow-up — 2026-11-18

`/admin/media-libraries` now includes connection settings for the configured Plex, Jellyfin, or Emby server and the independent Jellyfin bridge sign-in switch. The server validates the connection and supplies the resulting libraries. Saving without a replacement key preserves the stored key.

Compared the shared field and toggle controls with the previous Media Server Libraries baseline at desktop, iPhone 13, Pixel 7, and iPad Pro 11 sizes. The production Lumen build and sixteen browser checks passed with mocked connection and library data. Tautulli settings and Plex device discovery still use the native interface.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-media-connections-20261118/`.

## Plex server discovery follow-up — 2026-11-18

The Plex connection form in `/admin/media-libraries` can discover owned servers and show advertised connections. Unreachable entries are unavailable. Choosing a reachable connection fills the draft address, port and HTTPS setting. The administrator explicitly saves the draft.

Compared the discovered selection against the previous Plex connection form at desktop, iPhone 13, Pixel 7, and iPad Pro 11 sizes. The Lumen production build and twenty browser checks passed with synthetic discovery and connection responses. No live Plex account was queried.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-plex-discovery-20261118/`.

## Tautulli connection follow-up — 2026-11-18

`/admin/media-libraries` now shows Tautulli configuration for Plex instances. It uses the existing Tautulli API to validate and save the connection, preserve a redacted key when unchanged, and disconnect when the hostname is cleared.

Compared the new section with the shared Plex connection controls at desktop, iPhone 13, Pixel 7, and iPad Pro 11 sizes. The production build, 24 browser cases, and six Tautulli API cases passed. Browser responses and server connections used fixtures.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-tautulli-20261118/`.

## Radarr service administration follow-up — 2026-11-18

Administrators can add, test, edit, or remove Radarr destinations from `/admin/radarr`. The form uses Radarr test results for profiles, root folders, and tags. Saved credentials stay hidden and removal requires confirmation.

Compared the form with Prowlarr's shared control layout on desktop, iPhone 13, Pixel 7, and iPad Pro 11. The production build and four browser checks passed with synthetic Radarr responses. Other service integrations remain in native settings.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-radarr-20261118/`.

## Sonarr service administration follow-up — 2026-11-18

`/admin/sonarr` reuses the Radarr service editor for connection tests and destination management. Sonarr also supports separate anime profiles, folders and tags, version-specific language options, season order and monitoring defaults.

Compared the Sonarr form against the Radarr baseline at desktop, iPhone 13, Pixel 7, and iPad Pro 11 sizes. Inspected the shared controls and the additional Sonarr selections. The production build and eight targeted browser checks passed with synthetic Radarr and Sonarr responses.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-sonarr-20261118/`.

## Lidarr and Whisparr service administration follow-up — 2026-11-18

`/admin/lidarr` and `/admin/whisparr` reuse the request destination editor for connection tests and service management. Lidarr selects metadata profiles returned by its connection test. Both use their service defaults and omit video-only 4K and request-button controls.

Compared both forms with the established Radarr layout at desktop, iPhone 13, Pixel 7, and iPad Pro 11 sizes. The production build and sixteen browser checks passed with synthetic service responses across Radarr, Sonarr, Lidarr, and Whisparr.

Screenshots and logs are retained on kspld0 under `/mnt/disks/scratch/task-deliverables/seerrng-lumen-lidarr-whisparr-20261118/`.
