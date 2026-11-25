# Included Lumen: integration status and remaining rollout

Status reviewed November 25, 2026. This describes source capabilities and
remaining work; it does not establish full feature parity.

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
| Finish published-image acceptance | Verify the fresh dark default and saved native/external choices, signed-in direct detail links, and matched native/Lumen behavior at phone/tablet/desktop. The v3.72.40 checks below cover a fresh setup entry, an upgraded config clone, saved Lumen routing, existing admin/member accounts, native escape, and companion auth/storage. A fresh-install headed check confirms the dark Lumen setup screen; signed-in detail routing and the matched published-image visual matrix remain open. |

Normal included Save/reload/PNG upload has passed headless checks against a real
SeerrNG server. Companion UID1000 save/upload and read-only failure also passed.
Included Lumen now reports a real storage write probe, the effective UID/GID where available, and the applicable storage error. Bundled desktop and iPhone checks with real sign-in simulated a disk-full diagnostic, then used the actual successful probe to confirm recheck enabled Save and retained the draft. Route tests covered an unusable config path and an intact saved configuration. Bundled Lumen imports a companion configuration export into a draft. For companion-local branding, supply the logo or icon as PNG, JPEG or WebP. The raster upload prepares the asset, and Save for everyone publishes its reference with the other settings. Read the saved settings back before retiring the companion. Published-image rollout qualification remains open. Physical Plex or
Jellyfin playback and real household-provider mutations require separate evidence.

### Published v3.72.40 rollout checks (2026-11-25)

The published amd64 SeerrNG image (`ghcr.io/snapetech-org/seerrng:v3.72.40`,
digest `sha256:b145f47c52563c342f8aa91ee886455b956777e2bf8b64906b25f74a9c5bcc8d`)
started with a read-only root filesystem, writable config mount, and UID 1000.
Its fresh config entered `/lumen/setup` (HTTP 200). An isolated copy of a
v3.72.28 config was first migrated by v3.72.29 and then upgraded to v3.72.40.
After setting the Lumen default, home enforcement, and non-admin lock with a
synthetic administrator, all three values survived a v3.72.40 container
restart. The existing synthetic admin reached native SeerrNG through `/seerrng`
and returned to enforced Lumen at `/`; the existing synthetic member was sent
to `/lumen/` from `/`, a native settings URL, and `/seerrng`.

The published companion image
(`ghcr.io/snapetech-org/seerrng-lumen:v3.72.40`, amd64 digest
`sha256:b29b2b51f6607d5a82c88149ade90d93096ca741d48b7b587098be549889b9a5`)
ran as UID/GID 1000 with a read-only root filesystem and a task-owned
`/lumen-data` mount. Through its same-origin proxy, the synthetic admin signed
in and read `/api/v1/auth/me`; the config capability reported writable storage
at UID/GID 1000; a settings save survived a fresh GET; a PNG upload was
served back; and anonymous access to the settings endpoint returned 401.

Headless screenshots at 390, 834, and 1440 CSS pixels are retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-rollout-20261125/`.
These runs used an isolated, copied test config and blocked outbound provider
and media-server access. They establish startup, upgrade persistence, route
policy, companion session proxying, and mounted-file operations only. The
discovery screenshot therefore does not establish live catalog behavior; real
provider responses, playback, fresh-install dark defaults, saved native and
external choices, direct detail links, and matched native/Lumen visual states
remain open.

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
setup link. Published v3.72.40 now has the partial runtime evidence recorded
above; the complete visual and saved-choice matrix remains to be qualified.

### Published-image fresh-install headed check (2026-11-25)

Started the published amd64 image `ghcr.io/snapetech-org/seerrng:v3.72.40`
(digest `sha256:b145f47c52563c342f8aa91ee886455b956777e2bf8b64906b25f74a9c5bcc8d`)
with a new task-owned config, UID 1000, read-only root, and no outbound
network. A headed Chrome session opened the container over its internal Docker
subnet. The root redirected to `/lumen/setup`; the rendered screen showed the
dark setup card and Plex/Jellyfin/Emby choices. A direct `/lumen/movie/550`
visit while signed out redirected to setup, as expected for a fresh instance.
This does not verify a signed-in detail page, saved native/external choices,
or matched native/Lumen screens. The screenshot is retained at
`/mnt/disks/scratch/task-deliverables/seerrng-lumen-rollout-20261125/published-image-visual-acceptance-b8c4e189/artifacts/fresh-lumen-setup.png`.
Provider egress was blocked, so live catalog content and provider behavior
were not exercised. Published-image qualification remains open.
