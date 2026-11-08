# Initial settings read recovery

Issue [603](https://github.com/snapetech-org/seerrng/issues/603) was reproduced
in the downloaded v3.72.22 image: an initial503 from settings/main exposed a
writable form with empty/default values. The reproduction intercepted only GET;
no real settings were changed. Source inspection found the same failed-load gate
in19 settings owners, including notification panels, jobs and About.

Each owner now requires data before mounting its loaded content. The shared
SettingsLoadState consumes the existing LoadingSpinner and PageErrorMessage
roles and calls that owner's SWR mutate for Retry. It receives a boolean failure
state, never raw provider errors or secrets. Metadata waits for both independently
saved settings sources before mounting either form. Existing cached data bypasses
the initial-load state so a failed background refresh cannot unmount drafts.
No new CSS, palette, size or button owner was added.

Production build, types, localization checks and lint pass, retaining existing
catalog diagnostics and lint warnings. Browser tests cover20 initial-read sources
across Orig/John at390/1440: failure, no mounted editable form, visible Retry,
a new GET, restored content, no mutation or uncaught exception, and overflow.
The matching error captures were inspected in both actual themes. Four further
cases retain a changed Main draft and dirty state through an actual503 refresh.
The background harness advances the application's30-second SWR de-duplication
window using Playwright's clock before reconnecting; its initial2.2-second attempt
made no request and was not evidence of an application failure.

The first80-case run passed. A stronger run explicitly asserted the actual theme;
79 initial cases passed, with one theme mismatch while another QA run changed
the same isolated account preference concurrently. The focused sequential rerun
passes that case. All four final background cases pass. The committed suite
contains84 cases; this record does not mislabel the intermediate83/84 run as a
fully green run. No live provider configuration or all-issue acceptance follows.

Retained evidence in the `seerrng-human-workflow-audit-20261107` deliverables:
`settings-initial-load-baseline.log`, `settings-initial-load-final.log`,
`settings-initial-load-theme-recheck.log`, `settings-background-load-final.log`,
`settings-initial-load-final/`, `settings-initial-load-final-contact.png`,
`settings-load-build.log` and `settings-load-lint.log`.
Public release delivery remains separate from source qualification.
