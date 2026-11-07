# Combined PR224 recovery

[PR224](https://github.com/snapetech-org/seerrng/pull/224) was a combined October
integration draft. Its closure comment said its changes were already on main or
handled elsewhere. The November6 audit found that statement was incomplete.
The original head is b5be78a22560237a91269fe3c07ad5ef284f445a. The PR was reopened
while omitted behavior was recovered and qualified. The receipts below now account
for the original aggregate; its useful omissions are fixed on main.

## Reproduced omissions repaired

The original dff2bde06 fixes were absent from current main:

- The TMDB list envelope rejected valid empty lists with zero total pages.
- The shared list-ID validator allowed12-digit IDs outside the provider's
  documented int32 range. It now accepts positive decimal IDs through2147483647.
  The API schema, settings validator and input limit agree; client instructions
  no longer tell users that12-digit IDs are valid.
- Carousels persisted physical scroll offsets. Arabic browsers return negative
  offsets, which the storage guard rejected. The shared Slider now saves a
  bounded logical position, restores the correct physical offset, and uses
  direction-aware navigation and accessible arrow labels.

Two native regressions fail before the TMDB repair and pass afterward. The full
TMDB/settings suites pass46 checks. The production server/client build and lint
pass. An Arabic390px browser baseline fails because the saved position is absent;
the candidate passes8 production-browser cases across SeerrOrig/SeerrNGJ,
English/Arabic and390/1440px. Each saves260 logical pixels, navigates to a title,
returns Back and restores the original physical position. Theme menus remain
inside the viewport and desktop sidebars remain on the correct logical edge.
Carousel screenshots were reviewed. No carousel CSS or card geometry is changed.
The first fixture attempt returned pagination objects for unrelated discovery
endpoints and caused a client error; the corrected harness isolates one real
carousel with typed settings fixtures. Both logs are retained.

The range is supported by the [TMDB v4 list details reference](https://developer.themoviedb.org/v4/reference/list-details).
Provider responses are fixtures; these checks do not claim a live TMDB account
request. Evidence lives in the catalog-recovery137 deliverables under `pr224-*`.
The final main CI revision remains the delivery gate.

## Original aggregate disposition

The original combined branch has50 nonmerge commits absent by ancestry from
main;18 are patch-equivalent. The remaining32 received semantic reconciliation,
without assuming their closed state established integration. The recoveries above address verified
missing behavior. Its old workflow routing, checksum, theme-owner and validation
engine changes must not overwrite the newer owner directives, current frozen
lockfiles or repaired semantic UI owners. The per-commit reconciliation and
final PR receipt are recorded separately before closure.

## Per-commit resolution receipts

All50 nonmerge commits are accounted for below. Eighteen have matching patch
identities on main. The remaining32 retain their behavior through a current
owner/successor or are superseded by newer policy and implementation. Source
ancestry is checked for every linked successor. This does not claim the old
aggregate branch itself was merged. Its verified missing behavior was recovered
in0cda1b3cb; [full main CI42312563943](https://github.com/snapetech-org/seerrng/actions/runs/42312563943)
passed at that revision, including the production build, native/Vitest suites,
Playwright, Cypress, documentation and workflow contracts.

| Original commit | Resolution and evidence |
| --- | --- |
| [3dc217215](https://github.com/snapetech-org/seerrng/commit/3dc217215a6547e9789b61fed3f85188c219bf03) | retained in current implementation: Verified stale-availability recovery uses signed removal plans and complete inventories in server/routes/media.ts.  |
| [67d9bdb98](https://github.com/snapetech-org/seerrng/commit/67d9bdb98ec11b3222c6693c4f7639bea900d0e1) | retained in current implementation: Current test-environment isolation guidance supersedes the old operational note.  |
| [7a1ced192](https://github.com/snapetech-org/seerrng/commit/7a1ced192c0af39dc2282e9331e783a819955cb5) | retained in current implementation: Format-aware request gating was recovered through merged PR205 and the current book file-evidence model. [Successor1](https://github.com/snapetech-org/seerrng/commit/691610253da06922b8faedc2c496e0076e0ac047) |
| [e5775b68b](https://github.com/snapetech-org/seerrng/commit/e5775b68b85318adad7e9f407c35e7d114f7a117) | superseded by current owner/policy: Old documentation lock checksum is superseded by current frozen lockfiles and successful documentation builds.  |
| [fec38bfd8](https://github.com/snapetech-org/seerrng/commit/fec38bfd830409585a6bdc6e8c2fdbfd4ee6fbaf) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [d3fbfc93e](https://github.com/snapetech-org/seerrng/commit/d3fbfc93e37edef7acd1121d70b23199f6149c6b) | retained in current implementation: Handled Plex watchlist items are retained through merged PR305. [Successor1](https://github.com/snapetech-org/seerrng/commit/65e164533ed89c5b7afd76410037a84440fe6625) |
| [0775e10c7](https://github.com/snapetech-org/seerrng/commit/0775e10c767e76dcaef36688e66ad9251f8945f8) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [8ca46e7a2](https://github.com/snapetech-org/seerrng/commit/8ca46e7a264fd807eab42b455319cac395d06af5) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [e49e88b76](https://github.com/snapetech-org/seerrng/commit/e49e88b7612f17b737c476c5da3288fc20f48dea) | retained in current implementation: Calendar localization is retained in current source and locale catalogs.  |
| [d5bde0b32](https://github.com/snapetech-org/seerrng/commit/d5bde0b32d0cfef8fdeeb1164ab217412fba6e74) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [2a025e6d4](https://github.com/snapetech-org/seerrng/commit/2a025e6d4bb3dbec84cf07391785807ada7cde71) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [22a73b78c](https://github.com/snapetech-org/seerrng/commit/22a73b78cc30facab29259ee6462a0cf7a6215b6) | retained in current implementation: Bookshelf transition is superseded by the current ChaptarrNG migration and retirement implementation. [Successor1](https://github.com/snapetech-org/seerrng/commit/b1d36bf72c3e3ada0f444163b96feedc09027571) |
| [51bdbff8d](https://github.com/snapetech-org/seerrng/commit/51bdbff8d9840ab2a33aa1586b278361e9925705) | retained in current implementation: Locale direction is owned by the current document and locale provider.  |
| [109c439bf](https://github.com/snapetech-org/seerrng/commit/109c439bfcadb0396f9e38d460b80fd6c4f5c0b8) | retained in current implementation: Unmonitored and dual-format availability are retained by request/scanner recovery and confirmed-file observations. [Successor1](https://github.com/snapetech-org/seerrng/commit/fe5a872bd8fc17107f04245a956e75e569388fba) |
| [c842ef3ba](https://github.com/snapetech-org/seerrng/commit/c842ef3bac37a2921634da02ed497b1486961dab) | retained in current implementation: Orphan visibility is retained through the dedicated orphan contribution. [Successor1](https://github.com/snapetech-org/seerrng/commit/868e156d7e40cd676a3c7ca908d0091fd94566e1) |
| [ac1269967](https://github.com/snapetech-org/seerrng/commit/ac12699670695e53a3ba39deddc550c7646e5159) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [d4e07301d](https://github.com/snapetech-org/seerrng/commit/d4e07301d5b0060e038e90c23e0013ac71ff8db8) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [44eb87c91](https://github.com/snapetech-org/seerrng/commit/44eb87c91ce4161a5f29ebe32aa9bc02252306ba) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [57d07a065](https://github.com/snapetech-org/seerrng/commit/57d07a065970c768b1da86e3914cdf1c5fd7b536) | retained in current implementation: Added request ordering uses request.createdAt with a request.id tie break in server/routes/request.ts.  |
| [d4bdda3f3](https://github.com/snapetech-org/seerrng/commit/d4bdda3f377f0c368689cfbe847946227f6c5990) | retained in current implementation: Processing-report behavior is retained through merged PR323. [Successor1](https://github.com/snapetech-org/seerrng/commit/82a73d748fe9c2f5db044f42521784227b86e477) |
| [c05f50068](https://github.com/snapetech-org/seerrng/commit/c05f500686fc369f784a7215ef46041cee14289b) | retained in current implementation: Refresh scheduling is retained through merged PR307. [Successor1](https://github.com/snapetech-org/seerrng/commit/a2117e12a5d97f9d2a307693feb3035dda761a96) |
| [66fb4b8b9](https://github.com/snapetech-org/seerrng/commit/66fb4b8b9f84c8d104277a8f5664913d4d2c521d) | retained in current implementation: Indonesian client/server catalogs and language registration remain present.  |
| [a00a8f613](https://github.com/snapetech-org/seerrng/commit/a00a8f61372688ce06263ee69badfe1afd308d70) | retained in current implementation: Quota behavior is retained through merged PR303 and current TV quota coverage. [Successor1](https://github.com/snapetech-org/seerrng/commit/7a3b63f850fa408eb422f6e44e5d8f54bc1251f9) |
| [6fb8c1937](https://github.com/snapetech-org/seerrng/commit/6fb8c1937bf95a0c774a27bb61b4c5928eb110fe) | retained in current implementation: Removal recovery is retained through the newer signed removal-plan implementation. [Successor1](https://github.com/snapetech-org/seerrng/commit/5ba05e7e611588b5a8a410eb41984587dfdef99c) |
| [3e6987c32](https://github.com/snapetech-org/seerrng/commit/3e6987c32bdd438c6fa076779efc54674bc9aa07) | retained in current implementation: Plex PIN expiry is retained with later cancellation and authority checks. [Successor1](https://github.com/snapetech-org/seerrng/commit/b4f93744c7d8c19adec4ef5dfb8c087299f21fcb) |
| [6ac0be1b8](https://github.com/snapetech-org/seerrng/commit/6ac0be1b856afbdd68da276e6dfa75652985c66d) | superseded by current owner/policy: Old Bookshelf retirement operational intent is superseded by current ChaptarrNG and legacy-migration scope.  |
| [3070145cd](https://github.com/snapetech-org/seerrng/commit/3070145cd522db6e0f5e4e8313f8cc0e34833c35) | retained in current implementation: Return-after-authentication behavior is retained by merged PR221 and PR297. [Successor1](https://github.com/snapetech-org/seerrng/commit/66bb617028712cd21e8cfa10ad3ba6ae8f737fc3) [Successor2](https://github.com/snapetech-org/seerrng/commit/8d08cbc4bb4781f4a2331a2aed99d175d45c1c0b) |
| [536a7ffe8](https://github.com/snapetech-org/seerrng/commit/536a7ffe8d9ad966113b3d3f3dda6de4ca2275d6) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [e6e0974e0](https://github.com/snapetech-org/seerrng/commit/e6e0974e02a4d8d5ef404a054368963453e788d4) | retained in current implementation: Old runner routing is obsolete under the November3 hosted-default owner directive; current fork permissions remain restricted. [Successor1](https://github.com/snapetech-org/seerrng/commit/c64b5b2a62ad63aa3afb915cabb52b27305b603f) |
| [25f1b9174](https://github.com/snapetech-org/seerrng/commit/25f1b9174323637b3b49bba2eca0b3c9b11b7f22) | retained in current implementation: TV quota regressions are retained with the quota implementation from PR303. [Successor1](https://github.com/snapetech-org/seerrng/commit/7a3b63f850fa408eb422f6e44e5d8f54bc1251f9) |
| [edc01ee6d](https://github.com/snapetech-org/seerrng/commit/edc01ee6deb6dc583fe762549a1641ea2a95aaea) | retained in current implementation: Old runner-class selection is superseded by current hosted-default source routing. [Successor1](https://github.com/snapetech-org/seerrng/commit/c64b5b2a62ad63aa3afb915cabb52b27305b603f) |
| [e1ab81d4f](https://github.com/snapetech-org/seerrng/commit/e1ab81d4ff9952e11f6d50fbfc741110478a24a5) | retained in current implementation: Release-note Git probing suppresses expected probe stderr in scripts/release-notes.mjs.  |
| [e7191317a](https://github.com/snapetech-org/seerrng/commit/e7191317a9ccfa4004e103930738ee8f1bba433f) | retained in current implementation: Indonesian server messages are retained in server/i18n/locale/id.json.  |
| [f6acd445d](https://github.com/snapetech-org/seerrng/commit/f6acd445dcc34b54503199f075760a124ed66dff) | retained in current implementation: Old repository runner labeling is superseded by current owner policy and source workflow routing. [Successor1](https://github.com/snapetech-org/seerrng/commit/c64b5b2a62ad63aa3afb915cabb52b27305b603f) |
| [444a96d06](https://github.com/snapetech-org/seerrng/commit/444a96d06873384969b5aae88d5aedbcc61bbe22) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [f8c54f057](https://github.com/snapetech-org/seerrng/commit/f8c54f0570f0b7d47e49ecaf12b92f3b637c9601) | retained in current implementation: Carousel position restoration is retained by PR226 and extended for RTL in0cda1b3cb. [Successor1](https://github.com/snapetech-org/seerrng/commit/ee3f98a9d3e323f6790b193d9d27738158df62d8) |
| [0b16ea4ba](https://github.com/snapetech-org/seerrng/commit/0b16ea4baa9505ce7756f0baa28851f0e8cf4783) | retained in current implementation: Shared carousel-storage guards retain bounded and malformed-storage regression coverage.  |
| [99c496fad](https://github.com/snapetech-org/seerrng/commit/99c496fada3bc2b571eb7ba77a2653e61631dafe) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [15dac8ab4](https://github.com/snapetech-org/seerrng/commit/15dac8ab43662c7748820ff433eb26609e7d2efe) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [810c6b943](https://github.com/snapetech-org/seerrng/commit/810c6b9436cc90f9ad4a875a58ced94da2f794de) | retained in current implementation: Current locale loading, controlled language selection and logical shell/menu owners replace the old shell/CSS implementation; eight production-browser RTL/menu cases pass.  |
| [b1088290b](https://github.com/snapetech-org/seerrng/commit/b1088290bc167a2f408e74457694bb1976b64e15) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [7c941da03](https://github.com/snapetech-org/seerrng/commit/7c941da03331f5b0c7941c1dba0d5cec32b977b2) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [ad9824141](https://github.com/snapetech-org/seerrng/commit/ad98241411234d3b6d12de51059d2becb66a6969) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [dff2bde06](https://github.com/snapetech-org/seerrng/commit/dff2bde061a921c854948bcbc8cbcbb7745b0ce2) | retained in current implementation: Recovered verified omissions: empty TMDB lists, supported list-ID bounds and logical RTL carousel offsets. [Successor1](https://github.com/snapetech-org/seerrng/commit/0cda1b3cb443cf95c228d60c2ccc8be0e2d38a57) |
| [31be080d0](https://github.com/snapetech-org/seerrng/commit/31be080d0cfd0444de3f831b46216056122875bb) | retained in current implementation: No-season TV handling is retained through merged PR232. [Successor1](https://github.com/snapetech-org/seerrng/commit/5ff3bd17c38e27abadba53519749ec9aa2d90917) |
| [b0cf4e7b2](https://github.com/snapetech-org/seerrng/commit/b0cf4e7b27bc67abcf622872451121453f9141b1) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [84650600c](https://github.com/snapetech-org/seerrng/commit/84650600ce1497821df8f18342afd71964adca5e) | retained in current implementation: Current media-management browser coverage exercises verified stale-availability recovery rather than the retired fixture contract.  |
| [432c2a4a6](https://github.com/snapetech-org/seerrng/commit/432c2a4a6a4518612f41e985d5e004a265885bc4) | retained in current implementation: SECURITY.md and issue-template configuration retain private vulnerability-reporting guidance.  |
| [120e5ccfd](https://github.com/snapetech-org/seerrng/commit/120e5ccfd7d388169ad717501c3b73425c388a76) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
| [e3bb68535](https://github.com/snapetech-org/seerrng/commit/e3bb68535a11898694b0a4f7a0e497acf6817a7e) | patch-equivalent on main: git cherry reports an equivalent patch on main; original aggregate ancestry is not claimed.  |
