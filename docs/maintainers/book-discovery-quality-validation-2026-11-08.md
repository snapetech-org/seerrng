# Book discovery quality and latency — November 8

Issue [#609](https://github.com/snapetech-org/seerrng/issues/609) reproduces two
remaining problems: Recommended sampled random catalog records, and the search
client plus route deadline could reject working slow responses.

Unfiltered Recommended now seeds its existing local quality/diversity ranking
from Open Library trending works. Explicit Random, search, subject and author
semantics remain unchanged. No user language is silently imposed. Searches have
a 30-second HTTP/abort budget shared across transient retries; the route allows
that deadline to settle before its 32-second fallback. Other metadata requests
retain their existing timeout. Existing bounded fields, response validation,
one-hour trending cache and shared request coalescing are reused. Empty failed
feeds remain retryable failures rather than cached success.

Validation:

- Three corrected baseline cases fail for random versus trending and the absent
  search-specific deadline. The first attempt had a test TypeScript annotation
  error; it is retained separately and is not product-failure evidence.
- Open Library client and complete discovery route suites: 166 passes, zero skips.
- One additional route case passes with a 12.1-second provider response that the
  former 12-second race rejected. The stalled-provider case still returns 503.
- Production server compile and focused lint pass. Rendered components, styles,
  theme geometry and the client build are unchanged.
- Live API checks against the compiled candidate return 50 results each for
  Recommended, Trending, Most Editions and English Recommended. The follow-up
  cached read measures 47, 47, 40 and 49 `posterPath` values respectively. The
  original counter incorrectly inspected `cover` fields; retain it as a harness
  error, not a claim that artwork was missing. Provider availability and cover
  ratios vary over time; there is no permanent completeness guarantee.

Four headless human workflows pass: Orig/John at 390/1440, default feed,
actual Sort By → Trending → Most Editions, reload, live response receipt and
horizontal non-overflow. Matching captures were visually inspected; the two
themes retain separate compositions. The initial John attempt clicked its
persistent disclosure closed before choosing the next option. The corrected
harness opens that disclosure only when the desired option is hidden; no UI
change was needed. No provider success is replayed in this live sweep.

The candidate mounts its freshly compiled server into the v3.72.24 container,
using that release's unchanged frontend and a synthetic configuration. It is
source qualification, not proof this change ships in the immutable v3.72.24 tag.
Keep #609 open until a containing release is delivered and verified.

Evidence on kspld0 is retained under
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/discovery609-*`.
