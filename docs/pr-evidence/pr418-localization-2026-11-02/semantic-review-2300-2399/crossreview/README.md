# SeerrNG PR #418 independent cross-review: W2300–2399

This packet independently reviews all 169 proposed locale-cell corrections from the primary W2300–2399 packet across the 12 direct locales. It is pinned to PR #418 OPEN/DRAFT at head `d49b44895d0ded9796f0c970ad09141212e9a98f`, tree `cebcfc11e0ea37c42f5b6e979e96cca8c89c7814`.

## Scope and evidence

- English insertion-order positions 2300–2399; first key `components.NotificationTypeSelector.mediaavailableDescription`, last key `components.PermissionEdit.autoapproveSportsDescription`. Neighbor boundary: 2299 `components.NotificationTypeSelector.mediaavailable` and 2400 `components.PermissionEdit.autorequest`.
- The live PR head, GitHub tree, remote branch, worktree head/tree/status, all 13 source/locale catalog hashes and Git blobs, all five caller-file hashes and blobs, and each pinned caller line were checked against the primary packet before review. Final PR/ref/worktree reattestation passed.
- All 169 primary current-target values and hashes read back exactly from the live d49 catalogs. Cross-review recommendations were written only to scratch and were not applied.
- Caller evidence for the 100 source IDs has 340 line references across five source files; no source has a caller gap. The source and caller context hashes are included per row.
- Placeholder, markup, and protected-literal parity for the final cross-review targets: 0 mismatches in each check.

## Dispositions

- Accept primary proposal: 149
- Revise primary proposal: 19
- Retain current value: 1
- Hold: 0

Hindi, Indonesian, and Vietnamese were independently reviewed in a separate subpacket covering 75 cells: 65 accepted, 10 revised, no holds. Its input and output checksum manifests validate; packet path and hashes are in `input-manifest.json`.

## Changes recommended by cross-review

- `2301` `zh_Hans` `components.NotificationTypeSelector.mediadeclined`: **retain-current** → 请求被拒
- `2306` `zh_Hans` `components.NotificationTypeSelector.mediarequestedDescription`: **revise-primary-proposal** → 当用户提交新的媒体请求且这些请求需要审批时发送通知。
- `2306` `zh_Hant` `components.NotificationTypeSelector.mediarequestedDescription`: **revise-primary-proposal** → 當使用者提交新的媒體請求且這些請求需要核准時傳送通知。
- `2309` `hi` `components.NotificationTypeSelector.softwareStatusDescription`: **revise-primary-proposal** → जब सॉफ़्टवेयर अनुरोध अनुमोदन की प्रतीक्षा में हों, स्वीकृत या अस्वीकृत हों, या विफल हो जाएँ, तो सूचनाएँ भेजें।
- `2311` `ar` `components.NotificationTypeSelector.softwareavailableDescription`: **revise-primary-proposal** → أرسل إشعارات عندما تصبح ROMs وألعاب PC التي طلبتها جاهزة للتنزيل.
- `2311` `fr` `components.NotificationTypeSelector.softwareavailableDescription`: **revise-primary-proposal** → Envoyer des notifications lorsque les ROM et les jeux PC demandés sont prêts à être téléchargés.
- `2312` `ja` `components.NotificationTypeSelector.userSoftwareStatusDescription`: **revise-primary-proposal** → ご自身のソフトウェアリクエストが承認待ち、承認済み、却下、または処理に失敗したときに通知を受け取ります。
- `2320` `hi` `components.NotificationTypeSelector.usermediadeclinedDescription`: **revise-primary-proposal** → जब आपके मीडिया अनुरोध अस्वीकार किए जाएँ, तो आपको सूचना मिलेगी।
- `2322` `zh_Hans` `components.NotificationTypeSelector.usermediarequestedDescription`: **revise-primary-proposal** → 当其他用户提交新的媒体请求且这些请求需要审批时，您会收到通知。
- `2322` `zh_Hant` `components.NotificationTypeSelector.usermediarequestedDescription`: **revise-primary-proposal** → 當其他使用者提交新的媒體請求且這些請求需要核准時，您會收到通知。
- `2377` `id` `components.PermissionEdit.autoapprove4k`: **revise-primary-proposal** → Persetujuan Otomatis untuk 4K
- `2379` `id` `components.PermissionEdit.autoapprove4kMovies`: **revise-primary-proposal** → Persetujuan Otomatis untuk Film 4K
- `2387` `id` `components.PermissionEdit.autoapproveComics`: **revise-primary-proposal** → Persetujuan Otomatis untuk Komik
- `2390` `id` `components.PermissionEdit.autoapproveMagazines`: **revise-primary-proposal** → Persetujuan Otomatis untuk Majalah
- `2394` `id` `components.PermissionEdit.autoapproveMusic`: **revise-primary-proposal** → Persetujuan Otomatis untuk Musik
- `2398` `id` `components.PermissionEdit.autoapproveSports`: **revise-primary-proposal** → Persetujuan Otomatis untuk Olahraga
- `2398` `vi` `components.PermissionEdit.autoapproveSports`: **revise-primary-proposal** → Tự động phê duyệt các yêu cầu thể thao
- `2398` `zh_Hans` `components.PermissionEdit.autoapproveSports`: **revise-primary-proposal** → 自动批准体育类请求
- `2398` `zh_Hant` `components.PermissionEdit.autoapproveSports`: **revise-primary-proposal** → 自動核准體育類請求
- `2399` `vi` `components.PermissionEdit.autoapproveSportsDescription`: **revise-primary-proposal** → Cho phép tự động phê duyệt các yêu cầu về giải đấu thể thao.

Exact source/current/primary/reviewed text hashes, caller pins, per-cell dispositions, and rationales are in `crossreview-ledger.jsonl`; changed or retained targets are duplicated in `revision-decisions.jsonl` for quick review. `source-catalog-attestation.json` records all 13 catalog hashes/blobs and five caller-file hashes/blobs plus pinned-line verification. `readback-evidence.json` records current-target readback and confirms no recommendations were applied. `attestation-before.json` and `final-reattestation.json` pin PR/worktree state before and after review. `input-manifest.json` records the primary and independent subset packet hashes. `INPUT-SHA256SUMS` and `SHA256SUMS` validate local input and packet files.

This is static machine cross-review only. It does not establish native-speaker or browser approval. No repository files, PR, or workflows changed; no tests, builds, or CI ran.
