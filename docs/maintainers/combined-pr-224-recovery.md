# Combined PR224 recovery

[PR224](https://github.com/snapetech-org/seerrng/pull/224) was a combined October
integration draft. Its closure comment said its changes were already on main or
handled elsewhere. The November6 audit found that statement was incomplete.
The original head is b5be78a22560237a91269fe3c07ad5ef284f445a. The PR is reopened
while omitted behavior is recovered and qualified.

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
main;18 are patch-equivalent. The remaining32 require semantic reconciliation,
not an assumption based on a closed state. The recoveries above address verified
missing behavior. Its old workflow routing, checksum, theme-owner and validation
engine changes must not overwrite the newer owner directives, current frozen
lockfiles or repaired semantic UI owners. The per-commit reconciliation and
final PR receipt are recorded separately before closure.
