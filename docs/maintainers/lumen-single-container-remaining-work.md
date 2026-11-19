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

Fresh installs default to the bundled dark Lumen interface. On upgrade,
SeerrNG preserves native home access for existing installations with no
saved choice. Explicit native, bundled Lumen, and companion choices are
retained. Administrators can choose bundled Lumen in General Settings.
This policy preserves the upgrade behavior documented in issue #629. A
disk-backed regression verifies the fresh default, the legacy fallback,
and all three explicit choices after reloading from disk.

| Remaining work | Acceptance |
| --- | --- |
| Qualify the complete rollout against published images | Fresh and real upgrade configs, old/new accounts, dark default and saved choices, same-origin auth, direct links, optional companion and native escape at phone/tablet/desktop sizes |

Normal included Save/reload/PNG upload has passed headless checks against a real
SeerrNG server. Companion UID1000 save/upload and read-only failure also passed.
Included Lumen now reports a real storage write probe, the effective UID/GID where available, and the applicable storage error. Bundled desktop and iPhone checks with real sign-in simulated a disk-full diagnostic, then used the actual successful probe to confirm recheck enabled Save and retained the draft. Route tests covered an unusable config path and an intact saved configuration. Bundled Lumen imports a companion configuration export into a draft. For companion-local branding, supply the logo or icon as PNG, JPEG or WebP. The raster upload prepares the asset, and Save for everyone publishes its reference with the other settings. Read the saved settings back before retiring the companion. Published-image rollout qualification remains open. Physical Plex or
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

Bundled desktop and iPhone checks on `f8fd882ba` imported both local branding
references from one companion export. Save stayed disabled after uploading the
logo alone, and a rejected upload and a simulated failed configuration save
left the existing shared configuration intact. After retry, the saved settings
referenced two distinct PNGs served by the bundled branding endpoint.

Fresh bundled installations now enter the Lumen wizard from the server home
address. Route tests verify the explicit Classic entry and switching back to
the default. Desktop and iPhone checks rendered the production bundle through
Express, with pixel-identical wizard screens for the home redirect and direct
setup link. The final published image remains to be qualified.
