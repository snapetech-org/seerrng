# Book discovery query repair

Issue [602](https://github.com/snapetech-org/seerrng/issues/602) reports that
Open Library rejects or stalls discovery queries combining match-all with real
filters. A direct, rate-limited upstream probe reproduced HTTP500 after10.47s for
`*:* AND trending_score_hourly_sum:[1 TO *]`; the same clause without the wildcard
returned HTTP200 in1.05s with11,018 matches. The response itself is not committed.

The route now joins only real clauses and supplies `*:*` when none exist.
Keyword/subject escaping, validation, account/category policy, sorting, local
availability and result mapping remain owned by their existing paths. No timeout
increase, provider fallback or permissive query interpolation is introduced.
Open Library documents fielded language filtering in its
[Search API](https://openlibrary.org/dev/docs/api/search).

Six targeted API regressions cover language, publication year, author, combined
trending/language, unfiltered fallback and trending scores. The baseline fails
filtered query expectations. The candidate's complete discovery-route run passed
all existing cases; its new author fixture initially expected an unparenthesized
clause, corrected to match the established fielded-query owner. The final targeted
run passes all six. Source tests mock the provider; direct upstream evidence is
separate. Source qualification does not imply public release delivery.

The additional request for a configurable request-admission language restriction
is not implemented by this query repair. Do not close that feature scope based
on a working discovery language filter.

Evidence: `books602-live-upstream-probe.json`, `books602-baseline-native.log`,
`books602-native.log`, `books602-regressions-final.log` in the retained
`seerrng-human-workflow-audit-20261107` task-deliverables directory.
