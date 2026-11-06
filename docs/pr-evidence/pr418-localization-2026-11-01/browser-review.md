# SeerrNG PR #418 browser review

Date: 2026-11-01
Baseline source head: `5a4342176a8325c371a35d489cb01c58283bc983`
Patched source head checked: `d641d9a9cfc714cc43598ee800c1a36490cae0cd` (live `refs/pull/418/head` at review time)
Repository evidence: `docs/pr-evidence/pr418-localization-2026-11-01/`

## Method and scope

- Used this agent's isolated headed Agent GUI browser session only; no user desktop or another agent's session. No saved login state was loaded or written.
- Started the baseline preview with a disposable SQLite configuration under `runtime-config/`, `E2E_TESTS=true`, and `TS_NODE_TRANSPILE_ONLY=1` because normal TypeScript compilation fails at the baseline head. No live media server or user data was used.
- Inspected the local `/setup` page at 1440×1000 across the 12 direct locales: ar, de, es, fr, hi, id, ja, ko, pt-BR, zh-Hans, zh-Hant, vi. Each screenshot records a translated setup stepper, warning panel, HTTPS selection, and media-server setup entry point.
- Also checked the first-run credential gate after choosing the advanced/manual setup path and opening the Jellyfin configuration form. I did not enter credentials or submit a login.
- A read-only navigation to `/settings/notifications/webhook` redirected to `/setup`; no authenticated notification/API result, bulk-modal, or carousel flows were available from the uninitialized local fixture.
- The browser tool exposed no viewport-resize control; mobile viewport review was not performed. No tests, builds, or CI jobs were run.

## Findings

1. **Baseline compile defect, PR-introduced:** normal `pnpm dev` at `5a4342176a8325c371a35d489cb01c58283bc983` failed with TS2339 at `server/lib/notifications/agents/webhook.ts:295`: the new webhook notification code reads `options.locale`, which is absent from the webhook agent options type. The route and agent payload do not supply a per-agent locale. The code path is active for webhook notification payload construction. The defect is confirmed in the PR diff against the base.
2. **Fix on patched head:** `d641d9a9cfc714cc43598ee800c1a36490cae0cd` removes the invalid locale option/type import and uses the configured server locale via `getIntl()`. Normal `pnpm dev` started at this head with `TS_NODE_TRANSPILE_ONLY` unset. The server became ready, `/setup` compiled and returned HTTP 200, and the TS2339 did not recur.
3. **Locale layout:** all 12 setup views rendered their selected locale. Arabic used RTL text alignment and a reversed setup stepper, with the visible controls and translated copy inside the panel. Across the desktop captures, translated labels and longer warning text wrapped within their cards; no clipping or overflow was visible in this setup flow.
4. **Visual follow-up candidate (not established as a PR regression):** the blue “HTTPS mode” and “Allow authenticated sessions over HTTP” labels look low-contrast against the amber warning card in the Arabic setup capture. This was a visual observation only; no contrast ratio was measured and the component styling is outside this locale-only diff.
5. **Authenticated flows gated:** manual setup still requires a media-server connection. Jellyfin's form requests a server URL, email/username, and password. No local-only admin bootstrap was available, so the notification settings, localized API results, bulk modal, and carousel could not be reviewed without external credentials. Do not interpret them as reviewed.

## Screenshot evidence

All files are PNG captures at 1440×1000. SHA-256 hashes:

| Locale / flow | File | SHA-256 |
|---|---|---|
| Arabic | `screenshots/setup-ar-1440x1000.png` | `cc477c8fb4edb87d2dce2066ff7f4a9e84fa487b4d37eccf1cccd53fb475f81c` |
| German | `screenshots/setup-de-1440x1000.png` | `e966e179bf0a964be7e2b4586e83bcc82e676e09d0b51af7462f76fa2992b320` |
| Spanish | `screenshots/setup-es-1440x1000.png` | `e4e120bbc17a152316edb03800090f7835d5d57692c7f6cc3c8235cfbdc29143` |
| French | `screenshots/setup-fr-1440x1000.png` | `0dfc8722c1efb737eb41dc1e3685a4b0ccf21d389c1b7c0e7b21b081c057f169` |
| Hindi | `screenshots/setup-hi-1440x1000.png` | `5973afdba4833b257e4e10bc8d5985b37e50807a86baf6528ff1a9970c4d08b7` |
| Indonesian | `screenshots/setup-id-1440x1000.png` | `de73f1aefea30159c3bfe309cb0b1e3edd8883b4ce0dd447b2a73410ac624cf0` |
| Japanese | `screenshots/setup-ja-1440x1000.png` | `236989e74f207afde399dc7c4eb9a24aa6e0c297431febd6352eafbf8f9f0868` |
| Korean | `screenshots/setup-ko-1440x1000.png` | `21eea2602db65a71120788a6ba93d1d606feb28b156f9a6b3c35ba69a2712622` |
| Brazilian Portuguese | `screenshots/setup-pt-BR-1440x1000.png` | `20a3222cfe64086a3cdd3f497e451aef77bae1456b39fcc1e997eae814e4f1d3` |
| Simplified Chinese | `screenshots/setup-zh-Hans-1440x1000.png` | `a6ff634c4e676f52d1ae8ba63e27c82b4864126182d9ddf730dfbd95dce83be1` |
| Traditional Chinese | `screenshots/setup-zh-Hant-1440x1000.png` | `932229744824dbf6b82a401c181fe51ef8fbcfcaefc6c4aae46b93420dc258be` |
| Vietnamese | `screenshots/setup-vi-1440x1000.png` | `3ee7b558ae9b50a6688c617ea1ebec4b5c72a3a496689baa1c540490ec8319f6` |
| Jellyfin credential gate (Simplified Chinese) | `screenshots/setup-gate-jellyfin-zh-Hans-1440x1000.png` | `a01d2abba7924a88f130f1aea3d251d5b9268b3d7d645f82b40a66527856d34a` |

## Patched-head startup check

- Ran normal `pnpm dev` at `d641d9a9cfc714cc43598ee800c1a36490cae0cd` with `TS_NODE_TRANSPILE_ONLY` explicitly unset, `NODE_ENV=development`, `E2E_TESTS=true`, and the same disposable `CONFIG_DIRECTORY`.
- The server logged `Server ready on 0.0.0.0 port 5066`; the TypeScript child recovered from an initial D-state during scratch filesystem reads and no TS2339 appeared.
- The first read-only `/setup` request timed out at 20 seconds while Next compiled the route. The server later logged `GET /setup 200 in 91s`; the next read-only request returned `HTTP 200` and 30,675 bytes in 3.8 seconds.
- Stopped this server cleanly after the route returned 200. Process IDs 3482781/3482816 exited and port 5066 was clear. Its logs remain in task scratch at `seerrng-browser-review-20261101/runtime-config/logs/seerr-2026-11-01.log`.
- Tracked worktree status at the checked head was clean before this evidence was added. No test, build, or CI command was run.

## Exact-head spot review (2026-11-01)

- Rechecked PR #418 as OPEN at source commit `affd7a87860e3613d5c6842c20eb0b45f3bd062f` and tree `2471ca52d8b94504879e5842e8ffae920a22e180`; the isolated headed preview was serving this worktree.
- At 1440×1000, the setup language picker changed the rendered first-run page to Spanish, German, and Arabic. The localized setup stepper and transport warning wrapped within their panels. Arabic showed right-to-left copy, right-aligned controls, and a reversed stepper with no visible clipping or overlap in the captured viewport.
- The blue `HTTPS mode` and authenticated-HTTP labels look low-contrast on the amber warning panel in the captured locales. This is an unmeasured observation; no contrast ratio was calculated and no styling change was made.
- The initial `/setup` viewport was also captured across all 12 direct locales at source head `d641d9a9cfc714cc43598ee800c1a36490cae0cd`. A diff from that commit to the current app source `affd7a87860e3613d5c6842c20eb0b45f3bd062f` contains only files under `docs/pr-evidence`; there are no `src` or `server` changes. The 12-locale capture set therefore covers the same app code as the current source, and Spanish, German, and Arabic have fresh captures from the current source.
- Scope remains the initial `/setup` viewport and locale switch only. The full setup flow, authenticated routes, and mobile layout were not reviewed. No transport choice, server connection, or login was submitted; no saved browser state was changed.
- Exact-head screenshots: `current-head/setup-ar-1440x1000.png` (SHA-256 `78a2b32a62b728442f3e1d33ccd198c81f7afebf8bcadea4940f3aa7ae91fa7e`), `current-head/setup-es-1440x1000.png` (SHA-256 `5ae7582b95b31c73c0b0bf85ccab259594652d1e9b7117ab590227f7b02054e1`), and `current-head/setup-de-1440x1000.png` (SHA-256 `71fd476f611f6ceafe9ead4cc3adb709401077fc99ffe7eddc9a1eea17ae9898`).
