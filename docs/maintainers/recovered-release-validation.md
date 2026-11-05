# Recovered release validation

The #494 history is preserved with two review repairs. Darwin's
[`stat -f %T`](https://github.com/apple-oss-distributions/file_cmds/blob/main/stat/stat.1)
reports file type rather than filesystem type. The workspace guard now uses
[`df -PkY`](https://github.com/apple-oss-distributions/file_cmds/blob/main/df/df.1)
to read the filesystem type and free KiB in one snapshot. Native macOS validation
calls the real guard before installing test fixtures. Simulator diagnostics stay
in the local task directory if copying them to the artifact workspace fails;
the job log records that retained directory.

Owner PR CI previously skipped both the release-note contract and chart job.
Those jobs now validate the selected PR commit and participate in the aggregate
result. The release-note range is the merge base of the live PR target and
selected head. Metadata must match the owner repository, author, main target and
exact head; an advanced head fails validation. PR body text is saved literally
and never evaluated by the shell. Internal-only owner changes still need an
explicit `release-note: none` in their PR body. Manual main checks retain their
parent-commit comparison.

Set the pool label first, then add `action:ci` to start validation. Adding or
changing a pool label alone does not start another build. To validate a new head,
remove and re-add the action label after inspecting active runs and side effects.
The fork caller retains its permission and repository gates and uses the same
explicit action trigger. CodeQL stays disabled.

Thirteen malformed fragments already on main were verified unpublished before
repair. Published fragments were preserved. Local evidence and native workflow
results are recorded under
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`.
Workflow routing requires live validation after the revision reaches main;
structural tests alone do not certify a deployed workflow.
