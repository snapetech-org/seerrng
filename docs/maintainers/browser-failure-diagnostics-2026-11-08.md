# Browser failure evidence retention

CI run 42474226472 at f3ad8798e failed one account-cache-isolation case
(1440 px, missing Issues heading after navigation); 588 passed and one skipped.
The workflow only retained PNG screenshots, discarding the error context and
Playwright failure trace identified in its log. The failure's exact cause remains
unverified; it is not being called a security regression or dismissed as a flake.

Six isolated local repetitions of the exact account-switch test passed at
066a2df90, three each at 1440 and 390 px. They assert document replacement on
sign-out/sign-in, hold the second account's issue response, verify private text is
absent before and after that response, and verify its empty result. The complete
066a2df90 CI browser suite in run 42477253268 then passed: 589 passed, one skipped,
including both account-switch cases. No timeout was relaxed and no assertion
removed to obtain a green result. Native tests in that run were still active at
the time of this note; the run is not described as wholly green.

The workflow now retains failed-test trace.zip and error-context.md files for
three days, separately from existing visual screenshots. This does not add runtime
configuration or credential files to uploads or widen runner permissions. A
workflow contract checks the failure condition, pinned upload action, bounded
retention and diagnostic paths. A subsequent full CI run must validate the new
workflow revision on its selected GitHub-hosted runner. The failure-only upload
will naturally be skipped on a successful run; no artificial failing job is
dispatched to exercise it.

Logs, local traces/screenshots and the earlier PNG-only CI artifact are retained
in the task deliverables directory under `f3ad-playwright-*`,
`account-cache-repro-*`, `066-playwright-completed.log` and `ci-trace-*`.
