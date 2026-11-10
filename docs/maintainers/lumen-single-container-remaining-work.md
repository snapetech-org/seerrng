# Included Lumen: integration status and remaining rollout

Status reviewed November 9, 2026. This describes source capabilities and remaining
work; it does not establish publication of the replacement release.

The complete shipped Lumen frontend is already bundled by `scripts/build-lumen.mjs`
and served by `server/lib/lumenFrontend.ts` on SeerrNG's ordinary listener, normally
port 5055, at `/lumen/`. Same-origin sessions, administrator configuration and
branding use `server/routes/lumen.ts`, with data under the main config's `lumen`
subdirectory. A separate container is optional. Settings → General chooses native
SeerrNG, included Lumen, or an explicitly configured companion. `/seerrng` and the
visible full-interface link retain native administrative access.

General settings now offer two optional controls alongside that selection.
**Apply Default Interface to All Users** makes the server home address follow
the administrator's selection even when a browser saved a classic-home choice;
it is off for existing installations. When included Lumen is selected,
**Lock Lumen for Non-Administrators** redirects signed-in non-administrators
from native pages to Lumen, while native sign-in and administrator access remain
available. Both controls are off unless an administrator enables them, and
switching away from included Lumen clears the lock.

The corrective candidate makes P's dark Lumen presentation the fresh-install
default. It preserves native root access on upgrades unless the administrator
selects another interface. **Automatic adoption for all existing users remains
unfinished.** That distinction prevents a repeat of #629, where an independently
configured companion was silently displaced.

| Remaining work | Acceptance |
| --- | --- |
| Distinguish compatibility defaults from deliberate interface selections, then safely adopt included Lumen for existing installations/accounts | Fresh and legacy unset choices enter Lumen; explicit native/external choices survive upgrade and restart; native escape works before sign-in |
| Provide an explicit checked import of companion preferences and branding | Preserve defaults, locks and safe URLs; enforce admin/CSRF and raster validation; failed import preserves both configurations; retire companion only after successful readback |
| Bring included storage diagnostics to companion parity | Report actual writability and UID/GID; read-only/missing directories explain failures; recheck and failed save retain drafts |
| Qualify the complete rollout against published images | Fresh and real upgrade configs, old/new accounts, dark default and saved choices, same-origin auth, direct links, optional companion and native escape at phone/tablet/desktop sizes |

Normal included Save/reload/PNG upload has passed headless checks against a real
SeerrNG server. Companion UID1000 save/upload and read-only failure also passed.
These do not prove the pending migration/import/diagnostics work. Physical Plex or
Jellyfin playback and real household-provider mutations require separate evidence.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [upgrade-routing report #629](https://github.com/snapetech-org/seerrng/issues/629).

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
