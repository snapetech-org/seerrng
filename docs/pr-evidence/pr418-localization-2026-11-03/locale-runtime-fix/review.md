# SeerrNG PR #418 locale initialization review

## Scope and pins

- PR #418: OPEN and draft.
- Branch: codex/seerrng-localization-overhaul-20261028.
- Exact head: 30f626a4626d460f426666cde02f5c1ed17fa206.
- Exact tree: 9b2616780791c73eb176aca6ad53061f1f3587d8.
- Branch and pull refs matched the exact head at final reattestation.
- Static, read-only review; no repository or PR writes, tests, builds, CI, or browser/runtime actions.

## Finding

### SEERR-LOCALE-001 - P2 - non-English SSR and first hydration render English before locale resolution

The server document resolves a locale from the saved locale hint cookie or Accept-Language and writes it to the root HTML lang/dir attributes (src/pages/_document.tsx:33-55). The React app does not receive that locale as its initial provider state: CoreApp initializes currentLocale and activeLocale to en and messages to an empty catalog (src/pages/_app.tsx:53-77), then renders IntlProvider using activeLocale and those messages (175-188).

On authentication routes, the app reads navigator.languages in a post-mount effect and then starts asynchronous locale loading (83-97, 113-149). On normal routes, Layout waits for useUser to return the current user before selecting user.settings.locale or the browser preference and setting the locale (src/components/Layout/index.tsx:69-83). useUser fetches /api/v1/auth/me on mount when there is no initial user (src/hooks/useUser.ts:97-120), and UserContext renders its children without a loading gate (src/context/UserContext.tsx:19-48). The catalog is loaded through asynchronous dynamic imports (src/i18n/locale/loadLocaleMessages.generated.ts:52-60).

Therefore the initial server-rendered content and first hydrated React render are English even when the document metadata already says the saved/browser locale. The selected locale appears only after the post-mount preference step and catalog import. This is actionable: it produces wrong-language first content and mismatches the document language metadata with the visible text, including for assistive technology.

Suggested follow-up: provide the resolved locale and loaded catalog to the initial app render, or keep the interface behind a localized loading state until the selected catalog is ready, while keeping document lang/dir aligned.

## Locale negotiation cross-check

The saved cookie hint has precedence in resolveAcceptLanguage; Accept-Language values are quality-sorted, then matched by exact locale, explicit Chinese Hans/Hant script, Chinese region, and base-language fallback (server/types/languages.ts:364-447). I independently checked the zh-Hans-TW case: the explicit Hans script maps to zh-CN before the TW region is considered. The earlier zh-Hans-TW misclassification hypothesis does not apply to this Seerr resolver.

The browser helper uses navigator.languages where present, and normal-route preference order is saved user locale, browser locale, then server setting (src/utils/browserLocale.ts:9-21; src/components/Layout/index.tsx:69-83). No separate locale-negotiation defect was found in this review.

## Conclusion

The English-first behavior is a real, actionable P2 issue by static source analysis. Runtime timing and visual duration were not observed; a headed browser review can confirm the exact delay but is not needed to establish the initial-state mismatch.
