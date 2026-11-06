# Settings search priority validation

Issue #195's exact API search still failed from Services: a local service API-key
label won before the indexed application-key destination. SettingsLayout now
prioritizes exact indexed terms before local DOM labels, preserving ordinary
local matches, hidden-category activation, unsaved-change handling and the
existing dedicated Prowlarr priority. The application-key index entry follows the
administrator-only visibility already enforced by its control and server route.
No CSS, component dimensions, provider configuration or API authorization changes.

Six API baseline cases fail and six Prowlarr cases pass on preceding source
09fa6c540. All twelve pass after repair across seerrNGJ, seerrOrig and persiusNG,
at 390×900 and 1440×900. Searches reach the expected route and visible target,
focus the appropriate control, and retain horizontal bounds. Matching
before-search and after-search captures were inspected in three contact sheets.
Nine of twelve before-search captures are exact decoded RGB matches; no overall
pixel-identity claim is made. The first harness incorrectly expected the
Prowlarr heading itself to receive focus; its existing owner instead focuses the
first control in the shared row. Corrected baseline/candidate artifacts remain.

Production build, unchanged bundle budget and focused source lint pass. Client types pass.
Full combined CI remains required before integration. The branch includes the
pending localization/recovery milestone; it must retain that ancestry when
integrated and does not belong to the immutable v3.72.10 release.

Historical browser checks also found persisted-theme assumptions in two fixtures.
The book-format test expects Orig's Media Filters disclosure; the scroll test
measures Orig's poster-only rows, whereas Persius intentionally adds captions.
Both now select Orig explicitly instead of inheriting another test's saved theme.
All five format/navigation cases pass using isolated headless Chromium. Electron
capture timeouts were retained as harness failures, without changing app CSS.
Two additional series cases now switch the granted Sonarr destination at390/1280;
with the two existing movie cases, all four pass. The initial synthetic series
omitted its required TVDB identity and correctly displayed the no-match state;
adding that fixture identity permits the actual selector path. Movie submission
is intercepted; series checks do not submit. No live provider/download is used.

Evidence lives under
`/mnt/disks/scratch/task-deliverables/seerrng-contribution-recovery-20261105/`:
`settings-search-priority-*`, `historical-themed-fixtures-accepted*`, and
`historical-series-destination-accepted*`. All runtime configs are isolated task
fixtures, with the network guard explicitly enabled. Native Windows/Firefox
select contrast and complete localization approval remain outside this check.
