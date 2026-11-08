# Lumen 4K requests — PR #607 review

Contributor commits f053400bf and 54f589d55 add tier choice on poster/Coming Soon
requests and advanced destinations, and offer movie 4K requests before an HD copy
exists. Keep both original commits in the merge ancestry. No dependency, workflow,
proxy, credential, remote-code or outbound-origin changes are introduced.

The review follows request payloads, per-kind permissions, public 4K switches,
server/profile/folder state, requester identity, media status and TV seasons.
Server-side request admission remains authoritative. Numeric permission guards
now reject negative, fractional and string values before showing privileged
choices. This is client presentation hardening; no backend authorization bypass
was demonstrated.

Repairs found during review:

- Advanced movie options remount when 4K becomes unavailable/pending so an HD
  request cannot retain the prior 4K server/profile/folder. A pending 4K copy no
  longer makes an otherwise unrequested HD copy look requested.
- TV advanced controls remain reachable when every HD season exists but 4K
  seasons are missing. Selecting 4K uses per-season status4k, refreshes selection,
  excludes owned 4K seasons, sends the 4K destination, and uses 4K playback links.
- Poster/featured-card optimistic feedback says 4K Requested for that tier.
- Tier selectors reuse existing segmented controls; no CSS/geometry owner is added.

Validation: contributor source builds and passes 27 native/proxy checks. Patched
source builds and passes 27 native checks, 423 browser cases with 13 documented
viewport/device skips, and 24 focused regression cases across desktop, iPhone,
Android and tablet. Matching contributor-baseline regressions are retained as
failure evidence. Provider data, users and request responses are deterministic
browser fixtures; these do not claim real household downloads or physical OS
app launches. Final merged-head CI and publication are separate gates.

Evidence is under task deliverables seerrng-human-workflow-audit-20261107/pr607-*.
