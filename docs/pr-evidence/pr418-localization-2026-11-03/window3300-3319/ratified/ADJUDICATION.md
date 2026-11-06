# SeerrNG W3300–W3319 post-seal adjudication

Pinned input: PR #418 at `7f652dc9b529506fded0064f73cf4a4d32dba1a9` (tree `9a42f2efdc0f64e99928a4994304413036b8a315`). The primary and independent ledgers were compared only after the independent ledger was checksum-sealed. All 240 source/current/caller pins match the clean input.

## Exact caller context reopened

- `src/components/Requests/index.tsx:2734-2894` maps request lifecycle states, including `completed`, `declined`, and `cancelled`, into displayed filter labels; `requestStatusMessageKey` maps `declined` and `cancelled` through the status-label catalog entries. Spanish/French declined/cancelled values were adjusted for the feminine `solicitud`/`demande` status context.
- `src/components/Requests/index.tsx:1540-1580` renders the pending-request Approve/Decline buttons and their tooltips. `decline` invokes `modifyPendingRequest('decline')`; `changeServer` appears only when `canRepairFailed` and opens the edit/resubmit modal. Candidate wording therefore names decline and resubmission accurately.
- `src/components/Requests/index.tsx:895-912` selects `country` only for sports metadata; `src/components/Requests/index.tsx:963-1030` uses `creator` for TV `createdBy` credits. These contexts drove the Japanese country label and Creator role refinements.
- `src/components/Requests/index.tsx:2541-2566` emits request-entry deletion success/error toasts around `deleteRequestStatus(requestId)`. The German, Hindi, French, Brazilian Portuguese, Arabic, Vietnamese, Chinese, and Indonesian candidates describe deletion of the request record rather than a request to delete something.
- Positions 3301, 3314, 3315, 3318, and 3319 remain 60 `hold-context` cells. Exact direct production references for their `components.Requests` IDs are absent; related `RequestStatus` namespace/dynamic rendering is context only. No held current value was changed.

## Result

The ratified plan contains 49 catalog-cell changes and 60 unchanged caller-gated holds. `ratified-readback.jsonl` has all 240 cells, exact final target text and hashes, and a matching computed hash for every planned target. This is a ledger readback only: no locale catalog was changed. Native-speaker approval and repository application/readback remain pending.
