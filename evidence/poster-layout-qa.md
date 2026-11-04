# Discover shelf poster layout QA

## Environment

- Baseline checkout: `171f8dec10b0c3cc05c8bec408dc23cd5d8944a4` in the isolated baseline worktree.
- Candidate checkout: `8522bb9aaa1ffe5617ec990b009ee5be3bd0aa68` plus this task's uncommitted CSS fix.
- Headless Chromium 156 with Cypress 16.1.1.
- Route `/`, Cypress README media fixtures and mocks, viewport 1280×633.
- The baseline commit contains the same broad theme overrides as the released v3.72.7 stylesheets.

## Results

- Baseline `readme-screenshots.cy.ts`: 2 passed, 1 failed. Discover expected “Meteora” to be visible, but its anchor measured `0 × 1 px`. Its books and music views also had fewer than the required eight visible cover images.
- Candidate `readme-screenshots.cy.ts`: 3 passed, 0 failed.
- The saved before/after images use the same temporary screenshot harness, fixtures, route, viewport, and scroll actions. The baseline shows empty books and music shelves; the candidate shows their poster cards.

## Root cause

The shared card stylesheet assigns `.poster-layout` a fixed `--poster-width` and matching flex basis. Both built-in theme stylesheets overrode that shared owner with an unscoped `width: 100%`, collapsing auto-sized slider and watchlist cards. Removing that broad override restores the shared width. SeerrOrig keeps its separate, scoped vertical-grid width rule.
