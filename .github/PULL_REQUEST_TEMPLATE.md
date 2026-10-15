<!--
    Please read contributing guide before submitting
    your pull request. Please fill in each section below to help us better prioritize your pull request. Thanks!
-->

## Description

<!--- Describe your changes in detail -->
<!--- Why is this change required? What problem does it solve? -->
<!--- If it fixes an open issue, please link to the issue here. -->

- Fixes #XXXX

## Merge

Use `main` as the target. Open a pull request only when current GitHub rules require one; push directly
when they allow it. Keep a pull request current with `main` only when those rules require it. Merge
after the checks and approvals required by current rules are satisfied. An explicit maintainer's
direction to merge is sufficient; no additional review or approval is required beyond those rules.
Use any merge method enabled in GitHub.

## How Has This Been Tested?

<!--- Please describe in detail how you tested your changes. -->
<!--- Include details of your testing environment, and the tests you ran to -->
<!--- see how your change affects other areas of the code, etc. -->

## Screenshots / Logs (if applicable)

## Release Notes

For any user-facing change, add one structured fragment under `release-notes/` describing it. A
single fragment may cover related user-facing changes in the same pull request.

- [ ] I added a validated release-note fragment under `release-notes/` for this user-facing change.
- [ ] This change is internal-only and needs no release-note fragment.

For internal-only work, select the second option or put `release-note: none` on its own line in
the PR description. For direct pushes or merge checks that read commit messages, put the same
marker on its own line in the commit message.

- [ ] The fragment includes audience, area, action, and breaking-change status.

Preview the rendered release text with `pnpm release-notes:preview` if useful.

## Checklist:

<!--- Go over all the following points, and put an `x` in all the boxes that apply. -->
<!--- If you're unsure about any of these, don't hesitate to ask. We're here to help! -->

- [ ] I have read and followed the contribution [guidelines](https://github.com/snapetech/seerrng/blob/main/CONTRIBUTING.md).
- [ ] Disclosed any use of AI (see our [policy](https://github.com/snapetech/seerrng/blob/main/CONTRIBUTING.md#ai-assistance-notice))
- [ ] I have updated the documentation accordingly.
- [ ] All new and existing tests passed.
- [ ] Successful build `pnpm build`
- [ ] Translation keys `pnpm i18n:extract`
- [ ] Database migration (if required)
