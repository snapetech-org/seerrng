<!-- Copyright (c) 2026 snapetech and SeerrNG contributors. -->

# GitHub Free Organization Migration Runbook

## Current status and resume point

**Status (2026-10-14 03:18 UTC):** the ownership transfer is complete for the eight NG application repositories. They now resolve under snapetech-org; the restricted trusted-main organization runner group is active. This work has not changed runner-group access, workflow restrictions, billing, or runner registration.

The trusted-main group remains workflow-restricted across 14 selected repositories and 21 workflow refs. All 18 organization runners were online; 8 were busy in this snapshot. The eight-project Actions queue held **160 non-terminal runs** (145 queued, 5 pending, 10 in progress; zero requested or waiting). Queued and pending work is unknown until GitHub reports completion. Leave group access unchanged and do not cancel valid work while the queue is non-empty.

| Repository | Queued | Pending | In progress |
|---|---:|---:|---:|
| SeerrNG | 25 | 3 | 2 |
| SLSKDN | 28 | 2 | 5 |
| SLSKR | 6 | 0 | 0 |
| QuestarrNG | 15 | 0 | 1 |
| TorrentNG | 1 | 0 | 0 |
| ROMarrNG | 4 | 0 | 0 |
| ChaptarrNG | 49 | 0 | 2 |
| BookshelfNG | 17 | 0 | 0 |
| **Total** | **145** | **5** | **10** |

At 03:17 UTC, the eight repositories had 93 open pull requests, including 24 drafts. Refresh PR heads, bases, reviews, and required checks before every merge. Only the exact current head can count as validated; a queued or pending job has not passed.

**Resume here:** finish canonical GitHub repository-owner references and runner-route fixes on pull requests, keep untrusted PRs and non-main refs on GitHub-hosted runners, and review/merge each PR only after its exact-head checks and diff review are complete. Verify post-merge main checks separately.

## Current scope

Eight NG application repositories are in the shared runner-pool work:

- [SeerrNG](https://github.com/snapetech-org/seerrng)
- [SLSKDN](https://github.com/snapetech-org/slskdN)
- [SLSKR](https://github.com/snapetech-org/slskr)
- [QuestarrNG](https://github.com/snapetech-org/QuestarrNG)
- [TorrentNG](https://github.com/snapetech-org/TorrentNG)
- [ROMarrNG](https://github.com/snapetech-org/ROMarrNG)
- [ChaptarrNG](https://github.com/snapetech-org/chaptarrng)
- [BookshelfNG](https://github.com/snapetech-org/bookshelfng)

Related transferred repositories include [Homebrew SLSKDN](https://github.com/snapetech-org/homebrew-slskdn), [BookshelfNG Unraid](https://github.com/snapetech-org/bookshelfng-unraid), [ChaptarrNG Unraid](https://github.com/snapetech-org/chaptarrng-unraid), and [IPTV Tunerr](https://github.com/snapetech-org/iptvtunerr). These are not additional members of the eight-project runner-route PR inventory.

Repository ownership and package ownership are separate. The verified SeerrNG GHCR/Docker Hub image coordinates and CodeQL model-pack name still use the snapetech namespace; keep those identifiers until the package APIs show they moved. Update GitHub repository links, repository identity fields, and workflow identities to the organization owner.

## Active operating constraints

1. Keep GitHub-hosted validation for pull requests, outside-contributor branches, and non-main refs. The trusted local pool is restricted to explicitly selected trusted workflows; approval of fork code does not make it safe for a persistent self-hosted runner.
2. Do not alter the live runner-group allowlist or cancel queued work to improve the queue snapshot. Preserve valid in-flight Actions runs.
3. Treat queued, pending, skipped, canceled, and still-running required checks as incomplete unless the repository current gate explicitly defines otherwise. Review diffs and decisions at the same SHA used by passing checks.
4. Preserve repository-specific test engines, required coverage, workflow permissions, release restrictions, and registry/package names. Do not add spend or weaken security controls.
5. Record exact heads, bases, check outcomes, merges, post-merge results, and unresolved blockers in the task ledger. Do not include credentials or runtime backups.

## Historical pre-transfer plan (preserved; do not resume)

The material below is the original pre-transfer plan and snapshot. It records the assumptions and checklists that applied before snapetech-org existed and before the repositories moved. Its instructions to create an organization or perform transfers are historical, not current actions.

### Status and resume point

**Status:** Preflight documented; no organization has been created, no repository
has been transferred, and no runner registration or Actions policy has been
changed. The live transfer gate is currently closed.

**Last queue snapshot:** 2026-10-13 06:57 UTC, counted by the GitHub Actions
workflow-runs API status filter. The seven repositories had **176 non-terminal
runs**: 166 queued, 5 pending, and 5 in progress. Do not transfer repositories
while any of those runs remain non-terminal. The transfer guide does not specify
whether queued or running Actions work survives an ownership transfer.

**Resume here:** choose an organization login; publish this runbook; create and
secure a GitHub Free organization; verify the Free-plan runner controls without
enabling a paid plan; then wait for a fresh zero-run snapshot before considering
each repository transfer. Recheck the queue immediately before each transfer.

### Scope

This runbook covers the seven public application repositories in the shared
`kspld0` / `kspls0` runner pool:

- `snapetech/seerrng`
- `snapetech/chaptarrng`
- `snapetech/ROMarrNG`
- `snapetech/bookshelfng`
- `snapetech/TorrentNG`
- `snapetech/slskr`
- `snapetech/slskdN`

QuestarrNG and packaging repositories are outside this seven-repository runner
scope. Add them only after the owner confirms the exact expanded repository
list. Keep each project's validation engine and acceptance rules repository-
specific.

The current GitHub account login is the personal account `snapetech`; that login
cannot also be the organization's login. **Organization login and display name
are pending the owner's choice.** Existing organization memberships shown by
the authenticated CLI did not include a Snapetech organization.

### Hard constraints

1. Use GitHub Free only. Do not enable GitHub Team, larger runners, paid add-ons,
   or metered usage, and do not add a payment method. Stop if a security control
   needed for this design requires a paid plan. The owner previously set a hard
   limit of no additional spend and no reduction in existing runner capacity.
2. Do not cancel or disable workflows to manufacture an empty queue. Do not
   transfer a repository while it has a queued, pending, requested, waiting, or
   in-progress Actions run. GitHub documents transfer behavior for issues,
   pull requests, secrets, webhooks, deploy keys, and packages, but does not
   promise that active or queued Actions runs continue uninterrupted.
3. Transfer one repository at a time. Stop after any unexpected runner, Actions,
   package, integration, URL, permission, or pull-request result. Reconcile it
   before continuing.
4. Non-Snapetech pull requests must never execute code on `kspld0` or `kspls0`.
   Keep untrusted pull-request validation on GitHub-hosted runners. Never run
   untrusted pull-request code from `pull_request_target` on a self-hosted
   runner. A repository allowlist alone is not proof of this boundary for a
   public repository.
5. Do not put credentials, runner registration tokens, Proton data, or runtime
   backups in this repository or its pull request. Use the authenticated
   browser/Proton Pass UI for account credentials and redact values from the
   migration ledger.

### Verified GitHub behavior and open questions

#### Cost and runner capacity

The authenticated account billing page showed **GitHub Free at $0.00/month**.
GitHub's current plan table lists Free for organizations with 2,000 Actions
minutes per month. Standard GitHub-hosted Actions usage is free and unlimited
for public repositories, and self-hosted runner use is free. Moving these public
repositories to a Free organization therefore does not consume the private-repo
minute allowance for their standard hosted jobs or reduce their public runner
hours.

GitHub's current Actions concurrency table lists **20 concurrent standard
hosted jobs for Free**. The table does not separately show a GitHub Free for
organizations row for concurrency. The current personal account is Free, so the
expected cap is unchanged if the new organization is Free; verify the actual
organization's “All jobs usage” limit before any transfer and stop if it is
below 20. Moving to an organization does not itself add compute capacity.

Sources:

- [Product usage included with each plan](https://docs.github.com/en/billing/reference/product-usage-included)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [Actions limits and job concurrency](https://docs.github.com/en/actions/reference/limits#job-concurrency-limits-for-github-hosted-runners)
- [GitHub plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)

#### Runner-group plan support

GitHub's public documentation is inconsistent about organization runner groups
on Free: the self-hosted runner access guide lists GitHub Free as eligible, but
also says only Team organizations can create additional organization-level
groups; the runner-groups concept page says Team is required. Workflow-level
allowlists also need to be verified in the actual Free-plan settings. Do not
assume the Free plan supplies the desired policy, and do not upgrade to Team to
get it.

Before attaching any local runner, verify from the live organization settings
that the Free plan can enforce the required selected-repository access and any
workflow access restriction we intend to rely on. If not, leave the local
runners unattached and stop for a design decision. In either case, audit the
workflow files and public-fork behavior: GitHub warns that public-repository
forks can execute dangerous code on self-hosted runners.

Sources:

- [Managing access to self-hosted runners using groups](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access)
- [Runner groups](https://docs.github.com/en/actions/concepts/runners/runner-groups)
- [Secure use reference](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)

#### Repository-transfer effects

GitHub documents that issues, pull requests, wiki, stars, watchers, Git history,
webhooks, secrets, and deploy keys transfer with the repository. Package
behavior depends on registry. The prior repository URL redirects to the new
location, but GitHub Pages URLs are not redirected. The original owner is added
as a collaborator, and the receiving organization's default repository
permissions and membership privileges apply. When moving from a personal
account to an organization, issue assignments for people outside that
organization are cleared.

The transfer guide does not document the fate of queued or in-progress Actions
runs. Treat that behavior as **unknown**, not as uninterrupted. The no-active-
runs gate is mandatory; a clean queue is necessary but does not substitute for
checking for newly queued work immediately before each transfer.

Source: [Transferring a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)

#### CLI feasibility

GitHub documents organization creation through the account settings UI; the
GitHub.com organization REST API has no create-organization endpoint, and the
`gh org` command currently lists organizations but does not create them. The
authenticated Agent VM browser is therefore needed to create the organization.
Repository transfer itself has a REST endpoint (`POST
repos/{owner}/{repo}/transfer`) and can be invoked with `gh api` after the
organization exists. The standard `gh repo` command has no transfer subcommand.

Sources:

- [Creating a new organization from scratch](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/creating-a-new-organization-from-scratch)
- [REST API: transfer a repository](https://docs.github.com/en/rest/repos/repos#transfer-a-repository)
- [GitHub CLI: `gh org`](https://cli.github.com/manual/gh_org)
- [GitHub CLI: `gh repo`](https://cli.github.com/manual/gh_repo)

### Required organization baseline

Before moving any repository:

- Create the organization on the Free plan with no billing method or paid
  feature. Use a slug the owner has chosen; do not guess one.
- Require two-factor authentication for organization members if available on
  Free. Keep membership owner-only until the repository and runner policy is
  reviewed.
- Set default member repository permission to read or more restrictive, and
  grant owner/admin access only to named maintainers who need it.
- Set the organization Actions `GITHUB_TOKEN` default to read-only and leave
  workflow permission to create or approve pull requests disabled unless a
  specific audited workflow requires it.
- Require approval for workflows from public forks. Keep all such jobs on
  GitHub-hosted runners even after approval.
- Restrict self-hosted runner access to the explicitly selected repositories.
  Verify public-repository and workflow restrictions in the Free-plan UI/API
  before registering `kspld0` or `kspls0` runners at organization scope.
- Review each repository's workflow triggers, `runs-on` expressions, token
  permissions, checkout refs, environments, release/deploy jobs, and use of
  `pull_request_target`. Ensure outside-contributor code cannot reach local
  runners or persistent host credentials/data.
- Preserve the distinct runner policy already in use: ChaptarrNG on `kspld0`,
  BookshelfNG on `kspls0`, TorrentNG on both where supported, SLSKDN on its
  private server label, ROMarrNG and SLSKR hosted-only, and SeerrNG's local
  Mode 1 / hosted Mode 2 validation. Confirm current settings before relying on
  this memory-derived inventory.
- Preserve hosted GitHub Actions for public PR checks. Do not disable standard
  hosted runners, buy larger runners, or change project-specific validation
  gates as part of the ownership move.

If a listed baseline cannot be enforced on GitHub Free, stop before adding
local runners. Keep repository validation on hosted runners until the owner
chooses a no-cost safe alternative.

### Transfer preflight checklist

Complete this inventory for all seven repositories before the first transfer.
Record names and states, never secret values.

- [ ] Confirm repository owner, visibility, default branch, collaborators, open
      issues/PRs, branch protection/rulesets, and any organization policies that
      will apply after transfer.
- [ ] Inventory repository and environment Actions secrets/variables by name;
      confirm whether workflows consume them. Do not export or paste values.
- [ ] Inventory webhooks, deploy keys, Pages/custom domains, GitHub Packages or
      GHCR images, environments, deployments, releases, and required status
      checks. Confirm registry-specific package transfer behavior.
- [ ] Search source, workflows, badges, docs, bot configs, deployment files,
      and local scripts for hard-coded `snapetech/<repo>` references.
- [ ] Record runner registration scope, labels, host, service identity, and
      current online/busy state for each local runner. Do not copy registration
      tokens into the ledger.
- [ ] Confirm local clone remotes and repo URLs that need updating after the
      transfer.
- [ ] Query the Actions API status filter for every scoped repository and
      record zero runs with status `queued`, `pending`, `requested`, `waiting`,
      or `in_progress`; record the `total_count` for each status.
- [ ] Immediately repeat the per-repository Actions query before transfer. If
      any work is non-terminal, wait; do not cancel or disable it.

Example read-only queue check for one repository:

```bash
repo=snapetech/seerrng
for status in queued pending requested waiting in_progress; do
  printf '%s=' "$status"
  gh api "repos/$repo/actions/runs?status=$status&per_page=1" --jq .total_count
done
```

The status filter returns a total count without paging through old completed
runs. Repeat for each repository. The documented snapshot is not a substitute
for a fresh check.

### Per-repository transfer procedure

Proceed only after the owner selected the organization slug, the organization
baseline passed review, and the repository has zero non-terminal Actions runs.

1. Record the pre-transfer queue count, current repository URL, open PR/check
   state, and runner online/busy state in the ledger.
2. Re-run the queue query. Stop if any run is queued, pending, requested,
   waiting, or in progress.
3. Transfer the repository using GitHub's supported repository-transfer flow.
   Preserve its existing public visibility and default branch; do not rename it.
4. Verify the new owner/URL, visibility, default branch, open issues/PRs, Git
   refs, settings, secrets/variables by name, webhooks, deploy keys, packages,
   Pages, environments, required checks, and runner status. Do not assume a
   successful redirect proves dependent integrations still work.
5. Re-run the Actions queue query and confirm no run was canceled or stranded.
   If a run appears, stop the migration and investigate before moving another
   repository.
6. Update local clone remotes and hard-coded repository references as needed.
   GitHub redirects old Git URLs, but update clients to avoid relying on it.
7. Add a timestamped ledger entry and checkpoint the next repository only after
   every check above is complete.

Do not use force-pushes, disable workflows, rotate credentials speculatively,
or delete the prior repository path during this migration.

### Migration ledger

Update this table after each completed checkpoint. Keep tokens, secret values,
and private runner configuration out of it.

| UTC time | Repository | Pre-transfer queue | Transfer result | Post-transfer queue | Settings/integrations checked | Open issue |
| --- | --- | ---: | --- | ---: | --- | --- |
| 2026-10-13 06:57 | all seven | 176 non-terminal | not started | not checked | API status counts only | org slug pending; queue not drained |

### Recovery notes

- If work crashes before a transfer, read this status section, recheck the
  organization plan/settings and all seven live queues, then continue at the
  first incomplete checkbox.
- If a transfer fails or any state is unexpected, stop. Preserve the GitHub
  transfer confirmation/error and Actions links (never credentials), determine
  whether the repository already has a new owner, and repair that one repository
  before continuing. A reverse transfer is a possible recovery action, not an
  assumption that all permissions and integrations automatically roll back.
- If a new workflow becomes queued while the migration is underway, pause before
  the next repository and let it finish. Do not interrupt it to keep the
  migration moving.
- If the Free plan cannot enforce the intended runner boundary, keep the local
  runner registration unchanged until a no-cost safe design is available. Do
  not silently accept broader public-fork access.

### Current audit record

The authenticated GitHub CLI identified the current user as `snapetech`. The
following non-terminal run counts were observed at the snapshot above:

| Repository | Queued | Pending | In progress | Total |
| --- | ---: | ---: | ---: | ---: |
| SeerrNG | 34 | 2 | 0 | 36 |
| ChaptarrNG | 15 | 0 | 1 | 16 |
| ROMarrNG | 8 | 0 | 0 | 8 |
| BookshelfNG | 1 | 0 | 0 | 1 |
| TorrentNG | 13 | 0 | 0 | 13 |
| SLSKR | 68 | 3 | 3 | 74 |
| SLSKDN | 27 | 0 | 1 | 28 |
| **Total** | **166** | **5** | **5** | **176** |

This is a point-in-time read-only observation, not a claim about current queue
state after this timestamp. At approximately 06:56 UTC, the authenticated
billing page showed the personal account on GitHub Free at $0.00/month. The
organization's tier and concurrency remain unverified because it has not been
created. Transfers, organization creation, runner registrations, and Actions
settings remain **not started**.
