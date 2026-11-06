# SeerrNG PR #418 primary semantic review — W1200–1299

- Exact head/tree: `6ff9de1c39a19fe9c508f09e0f6a885022632d8b` / `68d7525714b3628bbe7b69701d8be08add152832`.
- Scope: 100 source IDs × 6 locales (`ar`, `de`, `es`, `fr`, `hi`, `id`) = 600 cells.
- Input packet: `/mnt/disks/scratch/task-scratch/seerrng-pr418-window-1200-1299-primary-20261102/review-input.jsonl` (`f41fc3a49bdeea482f584fd287372935bb7a9d80faeeecc56ec1b41cd59634e9`; 1,200 rows across all locales in the packet).
- Review rows: `review.jsonl`; one row per assigned cell, including original source/current target/hash, exact-head caller context, disposition, rationale, confidence, and replacement target/hash where proposed.
- Counts: accept-current=559, propose-correction=38, propose-refinement=3; frozen prior rows=0; input/caller pin mismatches=0; blocked rows=0.

## Caller notes for definition-only source keys

The five `ExternalMediaManageSlideOver` entries without direct uses (`book`, `comic`, `magazine`, `music`, and `manageModalIssues`) were checked against the surrounding slide-over flow. The component passes the media enum into `IssueMediaSummary`, uses separate `*Title` keys for its accessible modal title, and currently renders Downloads and Requests sections. Those five keys are definitions without a direct rendered use from this component; their row rationales record this. `Following.FollowButton.unfollow` is also definition-only; the current Following page's visible stop-following button uses the separate `Following.stopFollowing` key at `src/components/Following/index.tsx:343`.

## Limits

No native-speaker signoff is claimed. No repository/catalog edits, tests, builds, scans, CI/workflow actions, releases, or browser work were performed. All proposed target hashes are SHA-256 over the exact UTF-8 replacement text.
