# SeerrOrig and SeerrNGJ Implementation Plan

## Goal

Offer two complete, account-selectable interface systems on the SeerrNG engine:

- **SeerrOrig**, the default profile, based on the original Seerr design, cards,
  color choices, density, and video flows.
- **SeerrNGJ**, John’s interface and visual choices, including its arrangement,
  card geometry, palette, navigation, and control treatment.

Changing profiles must change the overall layout and style, not only a hue or a
small preset. Both profiles retain current SeerrNG routes, backend features,
libraries, permissions, and API contracts.

## Source of truth

- Engine/base: the connected SeerrNG GitHub `main` checkout. Keep this backend
  and library stack; do not reset the project to upstream.
- Original visual reference: `seerr-team/seerr` v3.5.1, commit
  `564bfb08b54caa374bddaf820abfd226e5e69151`.
- John visual reference: the current SeerrNG implementation and its
  `john-redesign` advanced palette preset in `src/utils/advancedThemePresets.ts`
  and `src/styles/globals.css`.
- Persistent state: the account's `UserSettings.interfaceTheme`, changed only
  through the own-profile settings route.

## Architecture

1. Keep feature components and server behavior shared. Components expose
   semantic roles such as `page-layout`, `sidebar-navigation`, `poster-layout`,
   and media detail classes.
2. `data-interface-theme` selects the complete profile. Load `shared.css`,
   `seerrOrig.css`, and `seerrNGJ.css` after the existing role stylesheet.
3. Each profile stylesheet owns its own tokens and arrangement for the same
   semantic roles. Shared CSS owns only cross-profile accessibility and safety
   rules. Do not use page-only style patches or duplicate property owners.
4. Keep accent-palette and advanced theme override preferences independent of
   interface selection. A profile is the layout and visual system; palette
   settings remain a color customization layer.
5. Default new settings to `seerrOrig`. One-time migration maps an explicit
   legacy `john-redesign` preference to `seerrNGJ`; it does not infer a John
   choice from unrelated color palettes.
6. The comparison preview uses current semantic roles and the same profile
   sheets. It is a review aid; real application screenshots remain the visual
   acceptance evidence.

## Long-term tradeoff

| Concern | Choice | Reason |
| --- | --- | --- |
| Speed | Keep one component tree and apply a root profile attribute | Theme selection does not remount pages, refetch data, or load a second JavaScript UI. The profile CSS is cacheable and styles switch synchronously. |
| Security | Keep SeerrNG route guards, API validation, provider libraries, and data model | A visual rollback must not remove newer security fixes, media-category boundaries, or request authorization. The new preference is an allowlisted value on the authenticated user's own settings route. |
| Maintainability | Keep semantic shared component roles and isolate each profile stylesheet | Avoid divergent feature implementations and duplicated APIs. A route or feature change remains shared; appearance and arrangement stay explicit per profile. |
| Compatibility | Keep current SeerrNG engine and libraries | The current tree carries the cross-media and admin capabilities that v3.5.1 predates. Replacing its server and libraries would create a much larger security and migration surface without helping the visual goal. |

## Implementation sequence

1. **Recover and record sources.** Pull SeerrNG main using the GitHub connector;
   check local work and remote refs; identify the exact upstream release and
   current John styling. Record missing artifacts honestly.
2. **Add profile contract.** Define stable profile IDs and parser, persist the
   account preference, expose it in the user payload, add a self-only API route,
   and provide SQLite/PostgreSQL migrations that safely recognize an existing
   column before adding it.
3. **Split style ownership.** Scope two full profile sheets and a small shared
   sheet. Add only semantic attributes required to express the upstream flat
   nav order without altering route permissions. Keep color palette selection
   independent.
4. **Rebuild comparison and handoff artifacts.** Produce a side-by-side
   preview, full route-family map, contract mapping, status ledger, and exact
   decisions for future contributors.
5. **Expand route coverage.** Inspect and implement profile arrangements for
   cross-media browsing/details, requests/acquisition, lists and collections,
   search tools, people, admin/settings, profiles, auth/recovery, overlays, and
   responsive states.
6. **Verify.** Test the profile API, user isolation, persistence, migration
   inference, CSS separation, keyboard/touch behavior, and routes. Run the
   required Node/Vitest/tooling/type/lint/format/build checks. Execute the
   PostgreSQL migration against a disposable database. Render matching
   screenshots at desktop and phone sizes.
7. **Publish each work slice.** Commit and push each completed turn to the same
   PR branch, update its draft PR body/status, and leave it unmerged.

## Acceptance gates

- Switching profiles changes nav order/grouping, page composition, poster/card
  shapes, spacing, typography, icons/badges, and colors.
- The two profile sheets are separate and contain materially different rules;
  the comparison preview shows those exact sheets.
- Both styles keep responsive layouts, focus visibility, reduced-motion
  behavior, semantic labels, and live interaction targets.
- All current feature actions and route permissions work in both profiles.
- The new default is SeerrOrig; explicit John preset migration selects NGJ.
- Migration, application, route, and build tests pass. Report render gaps as
  unverified rather than claiming complete visual acceptance.
- No PR merge or release is part of this work.
