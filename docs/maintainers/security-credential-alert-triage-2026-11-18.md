# Password hashing and session cookie alert triage, 2026-11-18

Dismissed CodeQL alerts 635–643 as false positives after tracing the
flagged SHA-256 digests to their consumers. They identify cache and
single-flight entries, discovery revisions, provider rate-limit buckets,
and requester-scoped idempotency keys. They do not verify passwords.
Local account password storage and verification use bcrypt in
`server/entity/User.ts` and `server/lib/passwordVerification.ts`.

Dismissed alerts 628–634 as false positives. They concern cookies issued
by isolated Supertest or loopback-only Express applications. The server
build excludes those test files. No production cookie configuration
was changed.

Verified that neither rule has any open alerts. CodeQL remains disabled
under the owner directive.
