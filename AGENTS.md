## Runner policy — SeerrNG owner directive, 2026-11-13

Use GitHub-hosted runners for all SeerrNG build, test, scan, package, and
release jobs when the required operating system and architecture are available.
Preserve native OS and architecture. Private ephemeral JIT is reserved for
explicit overflow on `kspld0` or `kspls0` (Linux or Windows, x64 or ARM64) and
Apple-signed builds on the MacBook Air. These are explicit routes, never
automatic fallbacks. `xcode-27` is a GitHub-hosted image.

Untrusted pull-request code must run on an isolated disposable GitHub-hosted
runner without secrets. SeerrNG public-fork validation uses read-only
repository permissions. Preserve active builds and other agents' work, and do
not restart the broker while it owns running guests.

The shared inventory in `snapetech-org/packer/scripts/shared-jit-runner-pool/`
continues to govern other repositories. This SeerrNG-specific owner directive
does not change their runner policy. Validate new workflow revisions on the
runner class they request; rerunning an old run uses its old revision.

# Agent Instructions

## UI changes

For any change affecting rendered UI, components, styles, themes, layout, states, or responsiveness:

1. Before editing, read the [UI Style Standard](docs/maintainers/ui-style-standard.md), [UI Fix-It](docs/maintainers/ui-fix-it.md), and task-specific visual evidence. Treat them as authoritative.
2. Trace the semantic CSS/component owner. Search its consumers; inspect cascade, breakpoints, and states. Assume shared owners affect the whole site.
3. Reuse existing owners. Add no Tailwind, page-only or duplicate CSS, or local overrides for shared properties. Preserve approved dimensions, spacing, typography, colors, and responsive behavior; make the smallest scoped change.
4. Render baseline and candidate at matching viewports and states; compare against approved references. Inspect changed pages and representative shared consumers for button geometry, alignment, spacing, typography, surfaces, overflow, and interactions. Fix regressions; record routes, states, viewports, evidence, and exclusions.
5. If rendering or comparison is blocked, mark acceptance unverified and UI work incomplete.

## Upstream source attribution

When SeerrNG gathers or adapts an idea, report, discussion, patch, rejected
request, issue, or pull request from upstream Seerr, update
`UPSTREAM_ATTRIBUTION.md` and the user-facing changelog in the same change.
Record the originating upstream URL, the upstream author’s GitHub handle, the
kind of source, and the behavior brought into SeerrNG. Say that the person
contributed or suggested it to the upstream project and that SeerrNG
independently adapted, integrated, or verified it. Never imply that the person
contributed directly to, endorsed, or participated in this fork.

Credit closed, unmerged, superseded, and rejected upstream records when their
code or ideas materially informed the fork. Before a release, audit every new
upstream reference in commits, release-note fragments, and changelog entries
for an author link and originating issue, PR, or commit link. Missing source
credit is a release-note defect and must be fixed before publication.

Also record upstream ideas that are planned, referenced, incomplete, rejected,
withdrawn, superseded, not applicable, or not yet reviewed. Put them in a
clearly labelled non-shipped section with an explicit disposition; never imply
that attribution means the behavior is implemented.
