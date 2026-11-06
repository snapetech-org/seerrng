# SeerrNG PR #418 semantic review: Arabic cells 250–299

This evidence package records the independent proposal, the root cross-review, the exact-hash plan used for application, and the focused validation report. The proposal and root review are separate files so their decisions remain independently auditable.

## Pins and dispositions

- Pre-apply PR head/tree: `2b40cb73e2d2f1b85b1532f0145c3f2f961f06b0` / `fdc5c1c42b0688c9c388adcd2b2996d00db99faf`.
- Frozen source bundle: `5a4342176a8325c371a35d489cb01c58283bc983` / `98cd64952123c9b678e38250e7819cabb4476448`; app-source tree `2471ca52d8b94504879e5842e8ffae920a22e180`.
- Independent review: 182 cells; 181 correction-needed and 1 accepted unchanged.
- Root amended cross-review: 176 suggestions accepted as proposed, 5 refined, 1 current target accepted. Applied 181 exact-hash Arabic corrections: 138 client values and 43 server values.
- The original root cross-review and plan are retained with `-original` names. The amended review/plan supersede them after protected-literal validation required preserving `TV` and limiting `Prowlarr` to its single source occurrence. No catalog values were written before that amendment.

## Validation

Exact English-source and pre-apply target hashes matched for all 181 cells. Catalog key parity, nonempty values, placeholders/ICU, protected literals, numeric parity, changed-key coverage, duplicate-key inspection, and `git diff --check` passed. The only exact-literal-only exception is `QuestarrNG: {value0}`: the message contains only a product name and placeholder, so the root-approved target remains source-identical while correcting the previous mistranslation.

Post-apply catalog hashes are recorded in `apply-report.json`. No tests, builds, scans, CI jobs, or releases were run. Native-speaker review remains outstanding; no native approval is claimed.
