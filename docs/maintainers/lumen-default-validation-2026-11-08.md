# Lumen default entry and native profile adoption

The owner explicitly requested Lumen and P's theme as defaults for existing and
new users in the next and future releases on November 8, 2026. This adopts the
actual contributor frontend rather than relabelling a native CSS package.

## Ownership and delivery

`build:next` and `build:next:compile` build the locked Lumen project into
`public/lumen` before Next. Native archives already copy public assets; the app
container copies the generated build's public directory. The companion image
keeps its root deployment. Generated assets do not enter Git. The generated embedded PWA manifest keeps
its launch URL, scope and every icon inside `/lumen/`. The build installs
locked dependencies without install scripts, including build dependencies even
when the calling environment is production.

The development entry also builds Lumen before starting the native watcher;
Lumen-only work can still use its existing Vite development server.

The main app sends an initialized household's unselected root entry to
`/lumen/`. New installations retain `/setup`. Lumen's existing Full SeerrNG link
reaches `/seerrng`, which records an explicit browser choice and opens the native
home. A native theme selection records the same choice only for the actor's own
account. Theme picker → Open Lumen is visible on the native interface and clears
that browser choice when Lumen opens. Logout clears the native choice before
a different person signs in on the shared browser. Native direct links remain valid. Cookies
contain only a presentation choice, no identity or privilege.

Lumen keeps its existing CSS and dark preferences; no layout, spacing or palette
CSS was added. The native default becomes PersiusNG. New SQLite/PostgreSQL
migrations adopt it for all existing settings rows and change the column default
for future inserts. Migration history prevents later startup resets. Locale,
permissions and other preferences are preserved; subsequent explicit native
theme choices remain available.

## Security and persistence

The embedded build uses the same-origin API and the main configuration volume.
The public configuration is presentation-only. Admin saves have 64 KiB limits,
atomic replacement and fresh actor authorization. Anonymous, ordinary and stale
admin actors cannot write. Branding accepts bounded PNG/JPEG/WebP signatures,
decodes with a pixel limit, and re-encodes PNG under generated filenames; supplied
filenames, SVG/scripts and arbitrary filesystem paths are not served. Public
reads are uncached; no session check is delegated to a caller-supplied service.
The main permission, category and provider checks still own media operations.

Lumen fetch mutations now send the current XSRF-TOKEN cookie as X-XSRF-TOKEN,
including admin configuration and branding. Sign-in alternatives link to the
native login for OIDC/other full-interface flows. Only Lumen HTML receives the
existing companion's Google font origins; native CSP remains unchanged.

## Qualification and limits

Twenty-two focused native checks pass, including routing, fresh setup, explicit
classic access, permissions, generated branding, SQLite defaults and security
headers. Four production-API/theme-admission checks pass, and 24 existing
user-settings checks pass. The actual PostgreSQL 16.15 migration check passes in
an isolated transaction/schema; existing test data is unchanged. A full app
production build and i18n checks pass.

Two actual compiled-production workflows at 390 and 1440 pass: existing admin
sign-in with real CSRF enabled, shared settings save/reload, new local account
creation and sign-in, denial of its admin write, full-native entry/reload with
PersiusNG, native theme picker return to Lumen and no horizontal overflow.
Catalog-only empty responses are replayed in Lumen; native home uses actual
metadata. Authentication, API authorization, account creation, configuration
writes and database migrations are real against an isolated fixture. Both
viewport workflows also upload a real PNG, verify its generated public image
and persisted configuration, and restore the original presentation. New test
accounts are removed after successful workflows. This is not household-provider
acquisition, physical iOS testing or completion of the historical issue audit.

The final compiled build passes both real workflows again after readiness.
Four matched source comparisons pass at 390/1440: login, Discover and You. The
You-page baseline/candidate screenshots are pixel-identical in both viewports;
background, font, sidebar (248px desktop), top bar (71px desktop) and overflow
match. Both generated CSS assets have SHA-256
`3e365c290b10007528e20940794dd00dc2801ee321a5c098d98fc07a31e10db0`.
The paired phone and desktop captures were visually inspected. The source
reference intentionally demonstrates old Lumen sign-in returning 403 with CSRF
on; its visual-only authenticated captures use explicit test-side login. The
candidate signs in through its own UI with 200. The reference HTTP harness's
initial root-path guard was corrected before those comparisons.

All 427 standalone Lumen browser cases pass with 13 viewport skips, including
four new CSRF sign-in cases. The maintained production-app default-entry cases pass at both widths, including
manifest launch/scope/icon delivery and shared-browser logout. Rechecking that
flow exposed the server document's hardcoded Orig HTML/stylesheet while the
client default had become PersiusNG. The server document now consumes the same
default constant; the rebuilt phone/desktop navigation checks pass. Tests also
wait for the selected user's stylesheet before interacting with theme controls.

Eight baseline/candidate native Plex settings cases pass across Orig, John and
390/1440 widths, followed by four final candidate captures after the shared-owner
repair. The 6px desktop Orig card-width difference was traced to a real cascade
bug: shared fallback aliases overrode the package's explicit 16px spacing when
its CSS was loaded first, yielding 24px instead. Making only the fallback alias
selector `:where` gives the selected package ownership in either load order,
without introducing dimensions or page overrides. The old source fails both
Orig load-order cases; all six final phone/desktop cases across Orig, John and
PersiusNG pass. John and phone geometry remain stable; Orig now consistently
uses its package's intended 16px gap. Native captures were visually compared.

The companion's Full SeerrNG redirect explicitly selects the native backend
entry with a query older backends safely ignore. Configured HTTP(S) links keep
their query/hash and make the same selection; unsafe schemes fall back to the
same-origin entry. All 27 actual companion/nginx/native checks pass, as do 16
focused browser cases for full-interface links and CSRF across four viewports.
The original full 427-case run remains the broader baseline; the two new link
cases add eight viewport checks, not eight different user features.

Integrated final-head CI and actual released-image qualification remain pending. The earlier ad hoc harness
needed login-readiness waiting, the menuitem role instead of link, and correctly
scoped catalog replay; those failures are retained rather than counted as passes.
A later run started before app readiness and its first navigation was refused;
readiness is now checked before execution. No product assertion was removed.

Evidence is retained on kspld0 at
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/`.
