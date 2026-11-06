# Related-title viewer availability

The real-server report in PR592 described Jellyfin search returning status1
while the detail page returned status5 for the same viewer and title.
`Media.getRelatedMedia` removed private native item identifiers before calling
`applyUserMediaServerAvailability`. The verifier consequently lacked the keys
needed to check access. Detail hydration already used the correct ordering.

Related-title hydration now verifies access first and redacts the response
afterward. This does not persist the viewer projection or expose operational
identifiers. Twelve regressions cover allowed and denied viewers across Plex,
Jellyfin and Emby, each in standard and4K. Before the change, all six allowed
cases failed while denied cases passed. Afterward, all twelve pass; the complete
focused entity, availability and response suites pass39 tests. Server TypeScript
and changed-file lint also pass.

Provider responses are fixtures, not a live household acceptance claim. Evidence
is retained in the incoming-review20261106 deliverables as
`native-availability-order-*`, `native-availability-typecheck.log` and
`native-availability-lint.log`. Exact-head main CI remains the release gate.
