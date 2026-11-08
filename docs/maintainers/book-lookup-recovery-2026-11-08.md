# Book lookup recovery — issue605

Bookshelf details previously tried work/title/raw/provider aliases serially while
individual Chaptarr lookups could try multiple 60-second provider scopes. Details
also omitted the negotiated hc: identity from their acceptance list. Edition
comparison searched by title even when it already knew the exact work.

Details and edition comparison now share a 25-second asynchronous deadline across
provider detection, fallback reads and edition queries. Abort signals cancel the
HTTP socket and transient Retry-After waits. Known identities use the provider
identity helper first; known hc/gr lookups never switch namespace. Identical
pending lookups share work only within the same endpoint, credential digest,
format, provider dialect and term. The pending map is bounded and clears on both
success and failure. Writes are not coalesced.

The request modal shows existing shared warning and Retry controls after an
uncached metadata failure. Edition errors retain their existing explanation that
Automatic best match remains usable, with explicit Retry. Both SWR hooks stop
background retry loops after errors. No CSS, sizing or theme owners change.

Actual production browser testing additionally reproduced a 400 before edition
Retry reached its handler: the OpenAPI author parameter rejected spaces/punctuation
from URLSearchParams. It now permits those reserved characters, consistently with
the existing title/term parameters; the handler retains its 256-character bound.
A validator regression fails before this schema repair and passes afterward.

The reported six-hour manual-retry behavior was checked rather than presumed.
The real retry route already removes an unclaimed outbox record during cleanup.
A regression inserts a persisted six-hour delay, invokes that actual authenticated
route, observes exactly one immediate dispatch and an empty outbox, and rejects
a second retry. No production retry/backoff rewrite was needed.

Validation includes a real 15-second HTTP success with two concurrent callers and
one lookup; cancellation of a 60-second stalled response; cancellation of Retry-After
sleep; credential/format/provider separation; 54 existing Readarr/edition native
cases; 20 catalog/edition Vitest cases; and the authenticated manual-retry check.
Production compilation and a subsequent final server compilation pass. Four
maintained Orig/John phone/desktop workflows exercise metadata failure→Retry and
edition failure→Automatic/Retry. The slow-provider production UI fixture checks
the actual deadline separately. CI and release qualification remain separate.

All provider/library examples are isolated fixtures; no real household download,
OAuth or acquisition side effects are claimed. Evidence and harness corrections
remain in task deliverables seerrng-human-workflow-audit-20261107/issue605-*.
The earlier issue606 CI failed because its API-message source manifest was stale;
this follow-up regenerates that manifest and the changed API-message surfaces.

The final slow-provider UI run passes all four Orig/John390/1440 cases: a60-second
provider fixture is canceled, the warning/Retry appears within35seconds, metadata
Retry recovers, Automatic remains enabled during an edition outage, and edition
Retry succeeds through the actual API validator. The maintained503-state cases
pass four candidates and fail four frozen baselines missing the metadata Retry.
Rendered warning/Retry states were inspected; established theme geometry is retained.
Harness corrections (missing cloned DB subdirectory, wrong grouped-control selector,
a duplicate title selector, and incidental ratings/series cache warming) are kept
with their original logs. The validator author400 required the production fix.

A follow-up preserves older Chaptarr0.9.911 native lookup fallback when its provider
facades have no index and no explicit v1 contract. Verified v1 Hardcover identities
still do not switch namespace. Both a legacy native-fallback regression and the
known-provider miss boundary pass; the overall deadline still bounds legacy work.
