# SeerrNG PR #418 Arabic setup description cross-review

- Cell: `components.Setup.advancedSetupDescription` (source position 5381), locale `ar`.
- Exact PR head/tree: `e32e1748e780740ae447dc5ab91eda5b5a9a79bb` / `15b64698e3e9f835e2dbde87ee9822bf8abce6d7`.
- Decision: **accept** the proposed Arabic wording.
- Final target SHA-256: `b4bd6e3a4183a5f9a6ba6645c45f3f86df38046278be8d5aa40eafe706d1e3d7`.
- Caller: `src/components/Setup/index.tsx:573`; the description appears below the guided/advanced setup choice.
- Worktree status showed only an unrelated modified `AGENTS.md`; source, Arabic catalog, and caller match the exact commit. This review made no repository changes.

The current second sentence is ungrammatical. The proposal clearly states that the user still needs to connect the media server before setup can finish.
