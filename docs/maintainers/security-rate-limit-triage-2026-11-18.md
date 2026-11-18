# Code-scanning rate-limit triage, 2026-11-18

Reviewed all 18 open `js/missing-rate-limiting` findings. Alerts
672–688 pointed to isolated Express apps exercised through Supertest.
Their source files are excluded from the production build by
`server/tsconfig.json`, and the shipped server does not mount those
fixture apps. Dismissed each alert as a false positive and verified
that no test-fixture alerts remain open under that rule.

The one remaining alert is
[671](https://github.com/snapetech-org/seerrng/security/code-scanning/671)
for the bundled Lumen shell. Commit
[efdb4c63d](https://github.com/snapetech-org/seerrng/commit/efdb4c63d)
added a per-client shell limit and verified that static assets bypass it.
The alert remains open on the earlier analysis. CodeQL remains disabled
under the owner directive.
