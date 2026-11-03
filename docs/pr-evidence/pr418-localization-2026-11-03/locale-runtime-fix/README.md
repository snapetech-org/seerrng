# Locale runtime initialization fix (prepared)

## Finding and scope

This packet prepares a fix for **SEERR-LOCALE-001** from the copied static review in [review.md](review.md). The finding was first recorded at PR #418 head `30f626a4626d460f426666cde02f5c1ed17fa206`; its runtime paths are byte-identical at the current pre-patch head, `c08aab4bb69590a73e6482c6c16a0ecc6a8a0e82`. The current tree is `1b9d940146936ee6b28af40563fcc6b680953ab6`. PR #418 remains open and draft on `codex/seerrng-localization-overhaul-20261028`; branch and pull refs matched that head at re-attestation.

## Prepared change

- `src/utils/localeHint.ts` reads the existing display-locale cookie in the browser, validates it against available locales, and returns `null` for missing or invalid values.
- `src/pages/_app.tsx` initializes from the browser preference on authentication routes, and from the valid cookie or browser preference on other routes. It waits until this selection is made and the matching message catalog (or English fallback) is ready before rendering the app tree.
- While waiting, the server and first hydrated render show the same neutral bootstrap indicator: the existing `LoadingSpinner` visual inside a `role="status"` region with `aria-live="polite"`, `aria-atomic="true"`, and `aria-busy="true"`, plus a visually hidden native indeterminate `<progress>` element named with the language-neutral hourglass symbol. The spinner is decorative to assistive technology. No English app copy is rendered before the locale is selected.
The status region follows the WAI-ARIA status semantics, including polite live updates and atomic contents ([WAI-ARIA status role](https://www.w3.org/TR/wai-aria-1.3/#status)); the native progress element is indeterminate because it has no `value` ([HTML progress element](https://html.spec.whatwg.org/dev/form-elements.html#the-progress-element), [accessible-name guidance for progress bars](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/#progressbar)).
- The app updates root `lang` and `dir` before showing localized content. When a requested catalog chunk fails, the last successfully loaded catalog stays active; on first load that is English, whose descriptors supply English defaults.
- The focused source patch is recorded in [patch.diff](patch.diff).

## SSR and static rendering tradeoff

This repository pins Next.js `16.4.2` and uses the Pages Router. Static source inspection found 146 route modules (excluding API routes and `_app`, `_document`, and `_error`), 6 with `getServerSideProps`, and none with `getStaticProps`; 140 route modules have neither method and remain eligible for Automatic Static Optimization. `_app` does not define `getInitialProps`. That avoids disabling Automatic Static Optimization as Next.js documents for a custom App with `getInitialProps` ([Custom App documentation](https://nextjs.org/docs/pages/building-your-application/routing/custom-app)). The existing custom Document remains responsible for server-side `lang`/`dir` ([Custom Document documentation](https://nextjs.org/docs/pages/building-your-application/routing/custom-document)).

The tradeoff is that SSG and SSR HTML shows the neutral spinner until hydration selects and loads a locale. A no-JavaScript client will keep seeing that pending indicator, and first app content is delayed by hydration plus the catalog chunk. This preserves static optimization without exposing English app copy before locale resolution. Browser timing and visual behavior were not tested.

## Static verification

- Re-attested live PR, branch, pull ref, head, tree, and clean pre-patch branch status before preparing the patch.
- Confirmed the runtime files cited by the earlier review have unchanged Git blob IDs between that review head and the current pre-patch head.
- `git diff --check -- src/pages/_app.tsx src/utils/localeHint.ts`: passed.
- Confirmed the tracked source diff is limited to those two files and no workflow paths changed.
- Verified the bootstrap path renders the same locale-independent markup during server render and first hydration; locale content is released only after catalog/default fallback and matching document `lang`/`dir` are set.
- No tests, builds, scans, CI, or browser/runtime checks were run.

Run `python3 verify_evidence.py` from this directory either before commit or on the focused one-commit descendant. It verifies the pinned parent, source blob IDs, exact source patch, expected file scope, bootstrap markup, and evidence checksums. This packet makes no release, merge, or runtime-validation claim.
