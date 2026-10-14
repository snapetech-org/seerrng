<!--
    Please read contributing guide before submitting
    your pull request. Please fill in each section below to help us better prioritize your pull request. Thanks!
-->

## Description

<!--- Describe your changes in detail -->
<!--- Why is this change required? What problem does it solve? -->
<!--- If it fixes an open issue, please link to the issue here. -->

- Fixes #XXXX

## How Has This Been Tested?

<!--- Please describe in detail how you tested your changes. -->
<!--- Include details of your testing environment, and the tests you ran to -->
<!--- see how your change affects other areas of the code, etc. -->

## Screenshots / Logs (if applicable)

## Release Notes

<!--
  Add one validated fragment under release-notes/ for every user-facing
  change. Select the internal-only option only when there is no user-visible
  behavior, documentation, security, or operational change.

  A release note must say what changed, who is affected, which product area it
  belongs to, and what action is required (or explicitly say `action: none`).
  See `release-notes/README.md` for the complete schema and preview command.

  Select exactly one of the first two options. The confirmation boxes below
  them may also be selected when they apply.
-->

- [ ] I added a release-note fragment under `release-notes/`.
- [ ] This change is internal-only and does not need a user-facing release note.
- [ ] The fragment includes audience, area, action, and breaking-change status.
- [ ] I previewed the release text with `pnpm release-notes:preview`.

## Checklist:

<!--- Go over all the following points, and put an `x` in all the boxes that apply. -->
<!--- If you're unsure about any of these, don't hesitate to ask. We're here to help! -->

- [ ] I have read and followed the contribution [guidelines](https://github.com/snapetech-org/seerrng/blob/main/CONTRIBUTING.md).
- [ ] Disclosed any use of AI (see our [policy](https://github.com/snapetech-org/seerrng/blob/main/CONTRIBUTING.md#ai-assistance-notice))
- [ ] I have updated the documentation accordingly.
- [ ] All new and existing tests passed.
- [ ] Successful build `pnpm build`
- [ ] Translation keys `pnpm i18n:extract`
- [ ] Database migration (if required)
