# UI evidence captures

- `theme-baseline-320px.png` / `theme-candidate-320px.png`: `/discover` movie shelves at 320x900, matched headless Chromium state. The broken theme showed no visible poster cards; the candidate showed the cards in two columns.
- `settings-main-layout-*`, `settings-jobs-layout-*`, `settings-network-layout-*`, `settings-plex-layout-*`, and `users-table-*`: `/settings/main`, `/settings/jobs`, `/settings/network`, `/settings/plex`, and `/settings/users`, respectively, at 1280x900 in matching headless Chromium states. Each `baseline` image is from v3.72.7; each `candidate` image is from this fix.
- `trakt-link-failure-baseline-*` / `trakt-link-failure-candidate-*`: `/profile/settings/linked-accounts`, mocked Trakt connect response 409 for a missing public HTTPS Application URL, at 390x844 and 1280x900. The baseline showed only a generic failure; the candidate shows the bounded server message and setup instructions.
- `cypress-full-run-note.md` and `cypress-current-batch-chromium-offline.png`: the full Cypress run stopped at spec 8 after 24 minutes because Chromium displayed `/offline.html` after a page-load timeout. This is a browser offline screen, not an application render. Impacted Cypress specs were run in isolated processes; the full 59-test Playwright suite passed.

The Trakt UI test uses a mocked missing-URL response. No live Trakt account or Chaptarr service was available for external-service validation. The screenshot's Chaptarr log rows omit the structured HTTP error details, so their transport or authorization cause remains undetermined.
