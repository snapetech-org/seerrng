# SeerrNG PR #418 cross-review: “Connect Services”

- **Exact PR head/tree:** `58697945e3d3fb44c37d49db0cc0f88e3af110cc` / `e3076937fe10b4dd3821ea573e8e5e21601fce7d`. Live PR, local checkout, official branch, and PR ref agree; PR is open and draft.
- **Scope:** English source position 5417, `components.Setup.configureservices`, across all 12 direct locales.
- **Primary proposals:** all three are accepted: Vietnamese `Kết nối dịch vụ`, Simplified Chinese `连接服务`, Traditional Chinese `連接服務`. None was revised or rejected.
- **Additional review finding:** recommend Spanish `Conectar servicios` to restore the source object omitted by current `Conectar`. Confidence moderate; the current is understandable in context.
- **Caller:** exact `src/components/Setup/index.tsx` lines 436, 465, and 500 render this message in the services-connection stage. The exact `SetupConnectionsGuide` source distinguishes media-server setup from service integrations. Chinese “configure server” is therefore mismatched.
- **Vietnamese:** exact current catalog value is `Cấu hình Dịch vụName`; the appended English `Name` is unrelated to “Connect Services”. The pinned Setup navigation renders this value. Proposed `Kết nối dịch vụ` removes the leak and matches the stage.
- All 12 locale catalog blobs and values, the English source, 3 candidate hashes, caller blob and 4 caller line pins were reattested. Source/current/final placeholder and markup profiles are empty.
- **Disposition:** 8 accept-current, 3 accept-primary-proposal, 1 additional refinement recommendation. Holds: 0. Native-speaker approval remains outstanding; none is claimed.
- This review used exact source/caller evidence and static catalog values; it did not repeat browser review. No repository files or PR metadata were changed, and no tests, builds, scans, or CI were run.

Files: `review-ledger.jsonl`, `exact-head-reattestation.json`, and `summary.json`.
