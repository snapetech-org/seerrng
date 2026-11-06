# SeerrNG PR #418 primary semantic review — W1200–1299, locale-b

- Exact head/tree: `6ff9de1c39a19fe9c508f09e0f6a885022632d8b` / `68d7525714b3628bbe7b69701d8be08add152832`.
- Scope: 100 source IDs × 6 locales (`ja`, `ko`, `pt-BR`, `vi`, `zh-CN`, `zh-TW`) = 600 cells.
- Input: `/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1200-1299-primary-20261102/review-input.jsonl` (SHA-256 `f41fc3a49bdeea482f584fd287372935bb7a9d80faeeecc56ec1b41cd59634e9`).
- Review rows: `review.jsonl`; one row per assigned cell with source/current target hashes, exact-head caller context, decision, rationale, confidence, and replacement target/hash where proposed.
- Counts: accept-current=547, propose-correction=35, propose-refinement=18; input/caller pin mismatches=0; blocked rows=0.

## Caller notes

The five definition-only `ExternalMediaManageSlideOver` keys (`book`, `comic`, `magazine`, `music`, `manageModalIssues`) were checked against the surrounding component flow. It passes a media enum to `IssueMediaSummary`, uses separate `*Title` keys for its modal label, and does not directly use those five definitions. Their rows preserve that fact in the rationale and caller assessment. `Following.FollowButton.unfollow` is also definition-only; the visible Following-page action uses `Following.stopFollowing`. The `fullCastProduction` event is emitted only for audiobook editions classified as full-cast. The `openarr` caller supplies a runtime service name; `openarrFormat` supplies both `{arr}` and a runtime `{format}` label. The Franchise event caller supplies a relation type for each new relation row, and the Following tools heading sits above `RelatedTools`.

## Limits

No native-speaker signoff is claimed. No repository/catalog edits, tests, builds, scans, CI/workflow actions, releases, or browser work were performed. Every proposed target preserves its source placeholder set, and its hash is SHA-256 over the exact UTF-8 text.
