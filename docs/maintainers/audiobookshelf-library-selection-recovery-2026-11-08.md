# Audiobookshelf library selection recovery — November 8

Issue [#511](https://github.com/snapetech-org/seerrng/issues/511) originally
covered the typed port sent to Test connection. That serialization fix is
present in stable23, but it did not establish that connecting a library could
actually finish. The continued human audit reopened the issue with
[a concrete reproduction](https://github.com/snapetech-org/seerrng/issues/511#issuecomment-6718580578).

On the downloaded published v3.72.23 image, Test connection successfully reads
a read-only loopback Audiobookshelf fixture and automatically selects its sole
book library. Add library remains disabled. Orig and John reproduce at 390x900
and 1440x900. The same source33 baseline supplies matching visual captures.
This is a real save blocker, separate from the earlier port serialization.

The shared Audiobookshelf modal sequentially updated libraryId and libraryName.
Formik's later validation used the previous empty library ID and retained its
required error. Manual selection used the same pattern. Selection now updates
only libraryId; submission already obtains libraryName from the loaded library
record, preserving the existing saved-name fallback when no new list is loaded.
No CSS, geometry, theme package, permission, provider-write or API-schema change
is introduced.

Validation:

- Two real-Formik cases fail against the baseline for automatic and manual
  selection. Candidate passes those plus the original typed-port regression.
  Save must enable and persist the selected library ID/name and numeric port.
- Four actual production API/browser workflows pass in Orig/John at both
  widths: type port, Test, automatically select, save, reload, edit port,
  connection failure, retain edited value, retry a reachable port, save again
  and reload. The backend filters out the fixture's podcast library. Readback
  retains the selected library and numeric port and redacts the API token.
- The maintained browser test now requires automatic selection and an enabled
  Add library button; it no longer hides the defect by selecting the already
  selected library again. This test still uses its declared probe response
  fixture; the four additional checks above use the real connection-test API.
- Production compile/typecheck, lint and prebuild i18n/shared contracts pass.
  The release-note fragment parses and 17 release-note tooling cases pass.
- Matching baseline/candidate captures were visually inspected for controls,
  alignment, labels, spacing, surfaces and overflow. The only intended state
  difference is the usable Add library action. Existing theme distinctions
  remain. Toast timing and scroll positions are recorded by the captures;
  no physical iOS/Android device or real household ABS service is claimed.

Artifacts remain on kspld0 under
`/mnt/disks/scratch/task-deliverables/seerrng-human-workflow-audit-20261107/abs511-*`.
Initial harness labels omitted the visible required asterisk; corrected labels
exposed the production bug. The first patched browser run completed creation
and retry but looked for Save instead of the existing Save Changes label;
correcting that harness yields four passes. Only task-owned connections are
created/deleted, and provider fixtures accept GET only.

This records source qualification. Full final-head CI and published replacement
artifact checks remain required before closing #511 again.
