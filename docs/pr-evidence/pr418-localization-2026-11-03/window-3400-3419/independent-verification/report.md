# Independent verification — SeerrNG PR #418 W3400–W3419

## Pinned source order

PR #418, branch, pull ref, commit API, and local HEAD/tree match `fcbc579f724e50a07dc0e12b00127c4f6084c453`, tree `30e1e5e610e88ba935e482fc7088311d00e214ae`. Candidate-free, primary, blind, and third-audit checksum manifests pass. The shared worktree was dirty by final verification, so exact file contents were read from committed HEAD blobs; its modified files were left untouched. The pinned English catalog has 9,494 ordered keys, matching the packet order hash. The correct zero-based neighbors are **3399 `components.Requests.requestLifecycle` / “Request Lifecycle”** and **3420 `components.Requests.searching` / “Searching”**. The packet records the wrong entries (“Import attempt {attempt} of {maxAttempts}.” and “Time”) at those boundaries; the selected 3400–3419 IDs do match catalog order.

## Dynamic caller contexts

- **3401 Requested:** `stageMessageKeys.requested` selects the requested message; `getStageLabel` resolves the dynamic key and renders timeline, accessible current-stage, and status-history labels (lines 484–485, 1195–1196, 1914, 2061, 2127, 2137).
- **3413 / 3414 ROMs Modern / Retro:** `mediaFilters` maps modern/retro to `romsModern`/`romsRetro` at 2715–2716. The actual accessible and visible labels render dynamically at 2920 and 2929. The third-audit pointer to line 2894 is wrong for ROMs; it renders task filters. This corrects evidence location, not the proposal.

## Four reconciled proposals

- **3409:id:** “Muat ulang informasi permintaan dari Seerr. Tindakan ini tidak memulai ulang atau mengunduh media apa pun.” fits both load-error refresh tooltips, preserves Seerr, and distinguishes refreshing from restarting or downloading.
- **3411:vi:** “Khởi động lại yêu cầu không thành công này từ bước phê duyệt.” fits the retry tooltip and restores the approval-step detail.
- **3413:ar:** “ROMs - حديثة” fits the Modern ROM filter and uses feminine singular adjective agreement for a non-human plural. The prior audit had low confidence; native confirmation remains appropriate.
- **3415:zh_Hans:** “时长” fits the runtime metadata label; production values include movie runtime, TV episode duration, and summed music duration.

I made no repository or PR edits. The shared worktree had uncommitted changes at final check; I left them untouched and read pinned files from `HEAD`. No tests, builds, or CI ran. This is a machine verification, not native-speaker approval.
