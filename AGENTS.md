# Agent Instructions

## UI changes

For any change affecting rendered UI, components, styles, themes, layout, states, or responsiveness:

1. Before editing, read the [UI Style Standard](docs/maintainers/ui-style-standard.md), [UI Fix-It](docs/maintainers/ui-fix-it.md), and task-specific visual evidence. Treat them as authoritative.
2. Trace the semantic CSS/component owner. Search its consumers; inspect cascade, breakpoints, and states. Assume shared owners affect the whole site.
3. Reuse existing owners. Add no Tailwind, page-only or duplicate CSS, or local overrides for shared properties. Preserve approved dimensions, spacing, typography, colors, and responsive behavior; make the smallest scoped change.
4. Render baseline and candidate at matching viewports and states; compare against approved references. Inspect changed pages and representative shared consumers for button geometry, alignment, spacing, typography, surfaces, overflow, and interactions. Fix regressions; record routes, states, viewports, evidence, and exclusions.
5. If rendering or comparison is blocked, mark acceptance unverified and UI work incomplete. This is agent acceptance, not separate human sign-off.
