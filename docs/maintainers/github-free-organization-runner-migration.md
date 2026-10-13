# GitHub Free organization and runner-group migration plan

Status: planned. No repository transfers or organization changes have been made.

## Current temporary policy

The NG repositories remain public under the `snapetech` personal account. The
repositories require approval for workflow runs from all external contributors.
Every pull request uses GitHub-hosted runners; local runners are reserved for
trusted `main` runs where supported.

This workflow condition is routing logic, not an enforced security boundary.
A public pull request can propose workflow changes, so review `.github/workflows`
before approving an external contributor's run. Repository-level runners on a
public repository do not provide runner-group restrictions for a selected
repository and workflow ref. GitHub warns that code from public forks can
compromise a persistent self-hosted runner. Keep external pull-request runs on
GitHub-hosted runners until organization-level runner groups are configured.

## Intended target

Move the public repositories to a GitHub Free organization with a separate
organization name. Keep the repositories public and use standard GitHub-hosted
runner labels for pull-request validation. GitHub documents standard hosted
runners as free and unlimited for public repositories; larger runners remain
billable, so do not select them.

Use organization runner groups for trusted local jobs. Limit each group to its
selected repositories and to exact workflow refs on `refs/heads/main`; keep
pull-request workflows on standard GitHub-hosted runners. GitHub Free
organizations support self-hosted runner groups and workflow restrictions.

References:

- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub-hosted runner availability for public repositories](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Runner groups for self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access)
- [GitHub's self-hosted runner security guidance](https://docs.github.com/en/actions/reference/security/secure-use)
- [Moving repositories to an organization](https://docs.github.com/en/account-and-profile/how-tos/account-management/moving-your-work-to-an-organization)

## Migration checklist

1. Confirm the target is a GitHub Free organization, the repositories will
   remain public, standard hosted runners are selected, and the billing page
   shows no paid runner configuration.
2. Inventory each repository's default branch, rulesets, open pull requests,
   releases and tags, Actions variables and secrets, environments and reviewers,
   webhooks, package permissions, Pages settings, and repository dispatch
   integrations. Record settings that need to be recreated after transfer.
3. Transfer one repository as a pilot. Verify redirects, clone and push URLs,
   branch protections, Actions permissions, secrets, environments, release
   automation, and package access before continuing.
4. Create shared runner groups by compatible host capability. Restrict each
   group to selected repositories and exact workflow paths pinned to
   `refs/heads/main`. Add the existing local runners to those groups after
   registering them at organization scope.
5. Keep pull-request jobs on `ubuntu-latest`, `windows-latest`, or
   `macos-latest`. Allow the local group only for trusted main-branch push and
   manual-main jobs. Leave any deployment or live-integration job pinned to the
   machine that owns its target environment.
6. Verify that external fork runs remain approval-gated and run on GitHub-hosted
   machines after approval. Verify main jobs use the intended runner group and
   that a pull-request workflow cannot select that group. Check the billing
   dashboard after the pilot and after the remaining transfers.
7. Continue with the other repositories only after the pilot checks pass. Keep
   a rollback record of prior settings and restore the previous repository owner
   if transfer or Actions configuration does not validate.

The transfer should be done one repository at a time. Do not make the move a
prerequisite for today's local testing; the approval gate and hosted routing are
the temporary controls until the organization is ready.
